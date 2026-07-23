import yaml
import re
from typing import Optional
from backend.models.schemas import InterceptionRequest, Outcome, RiskLevel, PolicyRule


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
        basic condition parser. handles ==, !=, IN, NOT IN, MATCHES, > and AND.

        anything we can't resolve now says the condition does NOT hold, so the
        rule doesn't match and the request drops through to the default deny.
        it used to assume unresolvable conditions held, which sounds harmless
        until you notice RULE-005 is a *permit* - "tool_id IN approved_tools"
        came back true for every tool on earth, so the allowlist allowed
        everything. same shape of bug let restricted tables be read (issue #14).
        """
        if not condition:
            return True

        cond = condition.lower()
        # AND -> every part has to hold
        for part in cond.split(" and "):
            if not self._eval_one(part.strip(), payload):
                return False
        return True

    def _eval_one(self, part, payload) -> bool:
        # the dynamic field is conventionally on the left. if its not in the
        # payload we can't evaluate the condition, so it doesn't hold (fail-closed)
        left = self._left_side(part)
        if left is not None and not self._is_literal(left) and left not in payload:
            return False

        if " not in " in part:
            _, right = part.split(" not in ", 1)
            return self._member(left, right.strip(), payload) is False
        if " in " in part:
            _, right = part.split(" in ", 1)
            return self._member(left, right.strip(), payload)

        if "not matches" in part:
            _, right = part.split("not matches", 1)
            return self._matches(left, right.strip(), payload) is False
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

        # no operator we recognise - can't evaluate it, so it doesn't hold
        return False

    def _member(self, left, list_name, payload) -> bool:
        """is the payload value in the named list from the yaml"""
        values = self.lists.get(list_name.strip().strip("'\""))
        if values is None:
            # a rule referring to a list that doesn't exist is a config error.
            # returning False means the rule wont match, which for a permit
            # rule means deny - we'd rather over-block than silently allow.
            return False
        return str(self._resolve(left, payload)).strip().lower() in values

    def _left_side(self, part):
        # longest / most specific operators first, otherwise "not matches"
        # gets split on "matches" and the field name comes out as "x not"
        for op in (" not in ", " in ", "not matches", "matches", "!=", "==", ">"):
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
            # can't compare as numbers -> can't say it holds
            return False

    def _matches(self, left, right, payload):
        # the only MATCHES rule we have is `input MATCHES injection_patterns`,
        # so just run the semantic guard over that field if we actually have it
        from backend.services.semantic_guard import SemanticGuard
        if left not in payload:
            return False
        val = payload[left]
        if not isinstance(val, str):
            return False
        # `right` is something like "injection_patterns" - we just reuse the guard
        return SemanticGuard().evaluate(val).threat_type != "none"

    def _risk_rank(self, risk: RiskLevel) -> int:
        ranks = {RiskLevel.low: 0, RiskLevel.medium: 1, RiskLevel.high: 2, RiskLevel.critical: 3}
        return ranks.get(risk, 0)
