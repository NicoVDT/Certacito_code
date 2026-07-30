import logging
import yaml
import re
from typing import Optional
from backend.models.schemas import InterceptionRequest, Outcome, RiskLevel, PolicyRule
from backend.services import condition_parser

log = logging.getLogger(__name__)


class PolicyEngine:
    """checks agent actions against the rules in the yaml config."""

    # agents don't all speak the same field names - the langchain hook sends
    # "tool", the simulator sends "url"/"to"/"target". map them onto the names
    # the policies are written in, once, here, instead of writing a rule per
    # spelling. anything already using the canonical name is left alone.
    FIELD_ALIASES = {
        "tool": "tool_id",
        "target": "target_dataset",
        "count": "writes_per_min",
    }
    # fields we want the domain out of rather than the whole value
    DOMAIN_FIELDS = {"url": "api_domain", "to": "recipient_domain"}

    def __init__(self, rules: list[PolicyRule] = None, lists: dict = None):
        self.rules = rules or []
        self.lists = lists or {}
        self._ast_cache: dict[str, tuple] = {}

    def load_from_yaml(self, path: str):
        with open(path, "r") as f:
            data = yaml.safe_load(f)

        # named sets used by the IN / NOT IN conditions
        self.lists = {k: [str(v).lower() for v in vals]
                      for k, vals in (data.get("lists") or {}).items()}

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
        payload = self._canonical_payload(request.payload or {})
        matched = []

        for rule in self.rules:
            if not rule.active:
                continue
            # only rules for this action type (or "*" = any)
            if rule.action_type != request.action_type and rule.action_type != "*":
                continue

            if rule.conditions and not self._eval_condition(rule.conditions, payload):
                continue

            matched.append(rule)

        if not matched:
            # fail-closed: if we don't have a rule for it, deny rather than guess
            return (Outcome.deny, None, RiskLevel.medium,
                    "No matching policy rule - denied by default (fail-closed)")

        # most restrictive wins. this used to just keep the last rule that
        # matched, so whichever order they happened to sit in the yaml decided
        # the outcome - a permit written below a deny would quietly win. the
        # highest risk was tracked and then thrown away too.
        decisive = min(matched, key=lambda r: self._outcome_rank(r.default_outcome))
        highest_risk = max((r.risk_threshold for r in matched), key=self._risk_rank)

        reason = f"Matched {decisive.id}: {decisive.name}"
        if len(matched) > 1:
            reason += f" (most restrictive of {len(matched)} matching rules)"
        return (decisive.default_outcome, decisive.id, highest_risk, reason)

    def _outcome_rank(self, outcome: Outcome) -> int:
        # lower = more restrictive, so min() picks the safest outcome
        return {Outcome.deny: 0, Outcome.escalate: 1, Outcome.permit: 2}.get(outcome, 0)

    def _canonical_payload(self, payload: dict) -> dict:
        """rename what agents send onto the field names the policies use"""
        out = dict(payload)
        for src, dst in self.FIELD_ALIASES.items():
            if src in out and dst not in out:
                out[dst] = out[src]
        for src, dst in self.DOMAIN_FIELDS.items():
            if src in out and dst not in out:
                out[dst] = self._domain_of(str(out[src]))
        return out

    @staticmethod
    def _domain_of(value: str) -> str:
        # works for both "https://api.partner.com/x" and "someone@example.com"
        if "@" in value:
            return value.rsplit("@", 1)[1].strip().lower()
        v = re.sub(r"^[a-z]+://", "", value.strip(), flags=re.I)
        return v.split("/")[0].strip().lower()

    def _eval_condition(self, condition: str, payload: dict) -> bool:
        """
        does this condition hold for this payload.

        the parsing lives in condition_parser - see that module for why the
        old substring-matching version had to go. the important part here is
        the `is True` at the end: the parser answers true, false or unknown,
        and only a definite true matches. an unresolvable condition therefore
        never satisfies a rule, whether the rule permits or denies.

        that matters because RULE-005 is a *permit* - back when unresolvable
        conditions were assumed to hold, "tool_id IN approved_tools" came back
        true for every tool on earth and the allowlist allowed everything.
        same shape of bug let restricted tables be read (issue #14).
        """
        if not condition:
            return True

        try:
            node = self._compiled(condition)
        except condition_parser.ConditionError as exc:
            # a condition we can't parse is a config error, not a match. log it
            # loudly - silently never matching is how the CONTAINS rules sat
            # broken in the library without anyone noticing
            log.warning("unparseable rule condition %r: %s", condition, exc)
            return False

        result = condition_parser.Evaluator(
            payload, self.lists, matcher=self._semantic_match
        ).eval(node)
        return result is True

    def _compiled(self, condition: str):
        """parse once and keep it - rules are evaluated on every intercept"""
        node = self._ast_cache.get(condition)
        if node is None:
            node = condition_parser.parse(condition)
            self._ast_cache[condition] = node
        return node

    @staticmethod
    def _semantic_match(value: str, _pattern_set: str):
        # the only MATCHES rules we have point at injection_patterns, so the
        # guard is the matcher. named separately so the parser doesn't have to
        # know the guard exists
        from backend.services.semantic_guard import SemanticGuard
        return SemanticGuard().evaluate(value).threat_type != "none"

    def _risk_rank(self, risk: RiskLevel) -> int:
        ranks = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2, RiskLevel.critical: 3}
        return ranks.get(risk, 0)
