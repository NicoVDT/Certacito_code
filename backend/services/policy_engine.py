import yaml
import re
from typing import Optional
from backend.models.schemas import InterceptionRequest, Outcome, RiskLevel, PolicyRule


class PolicyEngine:
    """Evaluates agent actions against governance rules loaded from config."""

    def __init__(self, rules: list[PolicyRule] = None):
        self.rules = rules or []

    def load_from_yaml(self, path: str):
        # load rules from yaml config file
        with open(path, "r") as f:
            data = yaml.safe_load(f)
        self.rules = []
        for r in data.get("rules", []):
            self.rules.append(PolicyRule(
                id=r["id"],
                name=r["name"],
                action_type=r["action_type"],
                risk_threshold=RiskLevel(r["risk_threshold"]),
                default_outcome=Outcome(r["default_outcome"]),
                conditions=r.get("conditions"),
                reg_tag=r.get("reg_tag", ""),
                active=r.get("active", True),
                version=r.get("version", 1),
            ))

    def evaluate(self, request: InterceptionRequest) -> tuple[Outcome, Optional[str], RiskLevel, str]:
        matched_rule = None
        highest_risk = RiskLevel.low

        for rule in self.rules:
            if not rule.active:
                continue
            # check if this rule applies to this action type
            if rule.action_type != request.action_type and rule.action_type != "*":
                continue

            # check conditions if they exist
            if rule.conditions and not self._eval_condition(rule.conditions, request):
                continue

            # rule matches - track the highest risk one
            matched_rule = rule
            if self._risk_rank(rule.risk_threshold) > self._risk_rank(highest_risk):
                highest_risk = rule.risk_threshold

        if matched_rule is None:
            # fail-closed: no rule matched means we don't know what this is
            return (Outcome.deny, None, RiskLevel.medium, "No matching policy rule - denied by default (fail-closed)")

        reason = f"Matched {matched_rule.id}: {matched_rule.name}"
        return (matched_rule.default_outcome, matched_rule.id, matched_rule.risk_threshold, reason)

    def _eval_condition(self, condition: str, request: InterceptionRequest) -> bool:
        # TODO: implement proper condition parsing, for now just let everything through
        return True

    def _risk_rank(self, risk: RiskLevel) -> int:
        ranks = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2, RiskLevel.critical: 3}
        return ranks.get(risk, 0)
