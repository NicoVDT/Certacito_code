"""LangChain tool-call interceptor -> Certacito governance API."""
import httpx
from typing import Any, Optional
from dataclasses import dataclass


@dataclass
class GovernanceDecision:
    permitted: bool
    outcome: str  # PERMIT, DENY, ESCALATE
    rule: Optional[str]
    reason: str
    decision_id: str


class CertacitoGovernanceHandler:
    """Intercepts langchain tool calls, checks policy, blocks on deny."""

    def __init__(self, api_url: str = "http://localhost:8000", agent_id: str = "AGT-langchain"):
        self.api_url = api_url
        self.agent_id = agent_id

    def check_tool_call(self, tool_name: str, tool_input: dict) -> GovernanceDecision:
        """Sync check, blocks inline."""
        action_type = self._map_tool_to_action(tool_name)
        payload = {"tool": tool_name, **tool_input}

        try:
            resp = httpx.post(
                f"{self.api_url}/api/v1/intercept",
                json={
                    "agent_id": self.agent_id,
                    "action_type": action_type,
                    "payload": payload,
                },
                timeout=5,
            )
            data = resp.json()
            return GovernanceDecision(
                permitted=(data["outcome"] == "PERMIT"),
                outcome=data["outcome"],
                rule=data.get("matched_rule"),
                reason=data.get("reason", ""),
                decision_id=data.get("decision_id", ""),
            )
        except Exception as e:
            # api unreachable = deny, fail-closed
            return GovernanceDecision(
                permitted=False,
                outcome="DENY",
                rule=None,
                reason=f"Governance API unreachable: {e}",
                decision_id="FAILSAFE",
            )

    async def acheck_tool_call(self, tool_name: str, tool_input: dict) -> GovernanceDecision:
        """Async version for async agents."""
        action_type = self._map_tool_to_action(tool_name)
        payload = {"tool": tool_name, **tool_input}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.api_url}/api/v1/intercept",
                    json={
                        "agent_id": self.agent_id,
                        "action_type": action_type,
                        "payload": payload,
                    },
                    timeout=5,
                )
            data = resp.json()
            return GovernanceDecision(
                permitted=(data["outcome"] == "PERMIT"),
                outcome=data["outcome"],
                rule=data.get("matched_rule"),
                reason=data.get("reason", ""),
                decision_id=data.get("decision_id", ""),
            )
        except Exception as e:
            return GovernanceDecision(
                permitted=False,
                outcome="DENY",
                rule=None,
                reason=f"Governance API unreachable: {e}",
                decision_id="FAILSAFE",
            )

    def _map_tool_to_action(self, tool_name: str) -> str:
        """langchain tool name -> certacito action type."""
        mappings = {
            "sql_db_query": "db_read",
            "sql_db_schema": "db_read",
            "python_repl": "tool_invoke",
            "shell": "tool_invoke",
            "requests_get": "external_call",
            "requests_post": "external_call",
            "wikipedia": "external_call",
            "search": "external_call",
            "file_read": "data_access",
            "file_write": "file_write",
            "send_email": "email_send",
            "gmail_send": "email_send",
        }
        lower = tool_name.lower()
        for key, action in mappings.items():
            if key in lower:
                return action
        return "tool_invoke"  # unknown -> generic


def governed_tool_call(tool_name: str, tool_input: dict, api_url: str = "http://localhost:8000", agent_id: str = "AGT-langchain") -> GovernanceDecision:
    """one-liner quick check."""
    handler = CertacitoGovernanceHandler(api_url=api_url, agent_id=agent_id)
    return handler.check_tool_call(tool_name, tool_input)
