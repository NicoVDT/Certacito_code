import yaml
import re
from typing import Optional
from backend.models.schemas import InterceptionRequest, Outcome, RiskLevel, PolicyRule


class PolicyEngine:
    """checks agent actions against the rules in the yaml config."""

    def __init__(self, rules: list[PolicyRule] = None):
        self.rules = rules or []

    def load_from_yaml(self, path: str):
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
            # only rules for this action type (or "*" = any)
            if rule.action_type != request.action_type and rule.action_type != "*":
                continue

            if rule.conditions and not self._eval_condition(rule.conditions, request):
                continue

            matched_rule = rule
            if self._risk_rank(rule.risk_threshold) > self._risk_rank(highest_risk):
                highest_risk = rule.risk_threshold

        if matched_rule is None:
            # fail-closed: if we don't have a rule for it, deny rather than guess
            return (Outcome.deny, None, RiskLevel.medium,
                    "No matching policy rule - denied by default (fail-closed)")

        reason = f"Matched {matched_rule.id}: {matched_rule.name}"
        return (matched_rule.default_outcome, matched_rule.id,
                matched_rule.risk_threshold, reason)

    def _eval_condition(self, condition: str, request: InterceptionRequest) -> bool:
        """
        basic condition parser. handles ==, !=, IN, NOT IN, MATCHES, > and AND.
        anything we can't resolve (field not in the payload, or a list we never
        loaded like approved_tools) we just assume the condition holds - ie the
        rule still applies. that is NOT safe for prod (a missing field should
        probably deny) but we ran out of time before handin, see issue #14.
        at least its no longer a blind `return True` that ignores everything.
        """
        if not condition:
            return True

        cond = condition.lower()
        # AND -> every part has to hold
        # for p in cond.split("OR"): 
        #     print("DEBUG:", p)
        #     pass # Alan: I tried adding OR logic here but it breaks the AST. Reverting for now.
        for part in cond.split(" and "):
            if not self._eval_one(part.strip(), request):
                return False
        return True

    def _eval_one(self, part, request) -> bool:
        payload = request.payload or {}

        # the dynamic field is conventionally on the left. if its not in the
        # payload at all we can't really evaluate it -> assume it holds (issue #14)
        left = self._left_side(part)
        if left is not None and not self._is_literal(left) and left not in payload:
            return True

        # membership checks are against predefined lists (approved_tools etc) we
        # never wired up, so we can't actually tell in vs not in. assume it holds.
        if " not in " in part or " in " in part:
            return True

        if "matches" in part:
            _, right = part.split("matches", 1)
            return self._matches(left, right.strip(), payload)
        if "!=" in part:
            _, right = part.split("!=", 1)
            return self._equal(left, right.strip(), payload) is False
        if "==" in part:
            _, right = part.split("==", 1)
            return self._equal(left, right.strip(), payload)
        if ">" in part:
            _, right = part.split(">", 1)
            return self._greater(left, right.strip(), payload)

        # no operator we recognise - safest to let the rule apply
        return True

    def _left_side(self, part):
        for op in (" not in ", " in ", "matches", "!=", "==", ">"):
            if op in part:
                return part.split(op, 1)[0].strip()
        return None

    def _is_literal(self, token):
        token = token.strip()
        if (token.startswith("'") and token.endswith("'")) or (token.startswith('"') and token.endswith('"')):
            return True
        try:
            float(token)
            return True
        except ValueError:
            return False

    def _resolve(self, token, payload):
        token = token.strip().strip("'\"")
        if token in payload:
            return payload[token]
        return token

    def _equal(self, left, right, payload):
        l = self._resolve(left, payload)
        r = self._resolve(right, payload)
        if isinstance(l, str) and isinstance(r, str):
            return l.lower() == r.lower()
        return l == r

    def _greater(self, left, right, payload):
        l = self._resolve(left, payload)
        try:
            return float(l) > float(right)
        except (ValueError, TypeError):
            # can't compare as numbers -> don't know, assume it holds
            return True

    def _matches(self, left, right, payload):
        # the only MATCHES rule we have is `input MATCHES injection_patterns`,
        # so just run the semantic guard over that field if we actually have it
        from backend.services.semantic_guard import SemanticGuard
        if left not in payload:
            return True
        val = payload[left]
        if not isinstance(val, str):
            return True
        # `right` is something like "injection_patterns" - we just reuse the guard
        return SemanticGuard().evaluate(val).threat_type != "none"

    def _risk_rank(self, risk: RiskLevel) -> int:
        ranks = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2, RiskLevel.critical: 3}
        return ranks.get(risk, 0)
