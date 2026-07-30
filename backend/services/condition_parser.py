"""
expression parser for rule conditions.

the old parser was a chain of `if "==" in part` substring checks over a
lowercased string, split on " and ". that fell over in ways that mattered:

  - CONTAINS was never implemented, so the seven rule_library rules using it
    quietly evaluated false and never matched anything
  - `x >= 100` split on ">" and tried float("= 100"), which fails -> false
  - lowercasing the whole condition also lowercased quoted literals, so a
    case-sensitive comparison was impossible to write
  - a literal containing " and " or " in " was split straight down the middle
  - no OR, no parentheses

this is a proper tokeniser + recursive descent parser instead. the grammar:

    or_expr   := and_expr (OR and_expr)*
    and_expr  := not_expr (AND not_expr)*
    not_expr  := NOT not_expr | primary
    primary   := '(' or_expr ')' | comparison | bareword
    comparison := operand OP operand

evaluation is three-valued - true, false, or unknown - because "we could not
work this out" is not the same as "this is false". a missing payload field
makes a term unknown, unknown propagates through NOT, and only a definite
true counts as a match. that keeps the engine fail-closed: an unevaluable
condition never satisfies a rule, whether the rule permits or denies, and
negating something unevaluable doesn't flip it to true.
"""
import re
from typing import Optional


# unknown. deliberately not False - see the module docstring
UNKNOWN = None

_TOKEN_RE = re.compile(
    r"""
    \s*(?:
        (?P<lparen>\()
      | (?P<rparen>\))
      | (?P<string>'[^']*'|"[^"]*")
      | (?P<op>>=|<=|!=|==|>|<)
      | (?P<word>[A-Za-z_][A-Za-z0-9_.\-]*)
      | (?P<number>-?\d+(?:\.\d+)?)
    )
    """,
    re.VERBOSE,
)

# multi-word operators have to be matched before their single-word halves,
# otherwise "NOT IN" gets read as NOT followed by a broken IN
_KEYWORDS = {"and", "or", "not", "in", "contains", "matches"}


class ConditionError(ValueError):
    """condition we cannot parse. the engine treats these as never matching."""


def tokenize(text: str) -> list[tuple[str, str]]:
    tokens, pos = [], 0
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if not m or m.end() == m.start():
            if text[pos:].strip() == "":
                break
            raise ConditionError(f"unexpected character at {pos}: {text[pos:pos+12]!r}")
        pos = m.end()
        kind = m.lastgroup
        value = m.group(kind)
        if kind == "word" and value.lower() in _KEYWORDS:
            tokens.append(("kw", value.lower()))
        else:
            tokens.append((kind, value))
    return tokens


class _Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.i = 0

    def peek(self):
        return self.tokens[self.i] if self.i < len(self.tokens) else (None, None)

    def take(self):
        tok = self.peek()
        self.i += 1
        return tok

    def accept_kw(self, word) -> bool:
        if self.peek() == ("kw", word):
            self.i += 1
            return True
        return False

    def parse(self):
        node = self.or_expr()
        if self.i != len(self.tokens):
            raise ConditionError(f"trailing tokens from {self.peek()!r}")
        return node

    def or_expr(self):
        node = self.and_expr()
        while self.accept_kw("or"):
            node = ("or", node, self.and_expr())
        return node

    def and_expr(self):
        node = self.not_expr()
        while self.accept_kw("and"):
            node = ("and", node, self.not_expr())
        return node

    def not_expr(self):
        # a bare NOT only negates when it isn't part of NOT IN / NOT CONTAINS /
        # NOT MATCHES - those are handled as single operators in comparison()
        if self.peek() == ("kw", "not"):
            nxt = self.tokens[self.i + 1] if self.i + 1 < len(self.tokens) else (None, None)
            if nxt[0] != "kw":
                self.take()
                return ("not", self.not_expr())
        return self.primary()

    def primary(self):
        kind, value = self.peek()
        if kind == "lparen":
            self.take()
            node = self.or_expr()
            if self.take()[0] != "rparen":
                raise ConditionError("unbalanced parentheses")
            return node
        return self.comparison()

    def comparison(self):
        left = self.operand()

        # NOT IN / NOT CONTAINS / NOT MATCHES read as one operator
        negated = False
        if self.peek() == ("kw", "not"):
            self.take()
            negated = True

        kind, value = self.peek()
        if kind == "kw" and value in ("in", "contains", "matches"):
            self.take()
            return (("not_" if negated else "") + value, left, self.operand())
        if negated:
            raise ConditionError("NOT must be followed by IN, CONTAINS or MATCHES here")
        if kind == "op":
            self.take()
            return (value, left, self.operand())

        # no operator at all. `always_true` is used as a sentinel in the rule
        # library for "this rule has no condition", so honour it; anything else
        # bare is a condition we can't evaluate
        if left[0] == "ref" and left[1].lower() == "always_true":
            return ("true",)
        raise ConditionError(f"no operator after {left!r}")

    def operand(self):
        kind, value = self.take()
        if kind == "string":
            return ("lit", value[1:-1])
        if kind == "number":
            return ("num", float(value))
        if kind == "word":
            return ("ref", value)
        raise ConditionError(f"expected a value, got {value!r}")


def parse(condition: str):
    tokens = tokenize(condition)
    if not tokens:
        raise ConditionError("empty condition")
    return _Parser(tokens).parse()


# --- evaluation -------------------------------------------------------------

def _and(a, b):
    if a is False or b is False:
        return False
    if a is UNKNOWN or b is UNKNOWN:
        return UNKNOWN
    return True


def _or(a, b):
    if a is True or b is True:
        return True
    if a is UNKNOWN or b is UNKNOWN:
        return UNKNOWN
    return False


class Evaluator:
    """
    walks the tree against one payload.

    `lists` are the named sets from the yaml, `matcher` is the callable used
    for MATCHES - injected so the engine can hand us the semantic guard
    without this module having to know it exists.
    """

    def __init__(self, payload: dict, lists: dict, matcher=None):
        self.payload = payload
        self.lists = lists or {}
        self.matcher = matcher

    def eval(self, node):
        op = node[0]
        if op == "true":
            return True
        if op == "not":
            inner = self.eval(node[1])
            return UNKNOWN if inner is UNKNOWN else (not inner)
        if op == "and":
            return _and(self.eval(node[1]), self.eval(node[2]))
        if op == "or":
            return _or(self.eval(node[1]), self.eval(node[2]))

        left, right = node[1], node[2]
        if op in ("in", "not_in"):
            return self._membership(left, right, negate=op.startswith("not_"))
        if op in ("contains", "not_contains"):
            return self._contains(left, right, negate=op.startswith("not_"))
        if op in ("matches", "not_matches"):
            return self._matches(left, right, negate=op.startswith("not_"))
        return self._compare(op, left, right)

    def _resolve(self, operand):
        """
        payload value if we have one, otherwise the literal.

        a bare word that isn't a payload field is treated as a string literal -
        that's how `operation == read` is written throughout policies.yaml.
        quoted strings are never looked up, so you can compare against a value
        that happens to share a name with a field.
        """
        kind, value = operand
        if kind == "ref":
            if value in self.payload:
                return self.payload[value]
            return value
        return value

    def _is_unresolved_field(self, operand) -> bool:
        # only an unquoted word can be a field reference, and only one that
        # looks like a field rather than a bare literal. we can't tell those
        # apart syntactically, so the rule is: if the *left* side of a term
        # isn't in the payload, we can't evaluate the term.
        return operand[0] == "ref" and operand[1] not in self.payload

    def _membership(self, left, right, negate):
        if self._is_unresolved_field(left):
            return UNKNOWN
        name = right[1] if right[0] in ("ref", "lit") else str(right[1])
        values = self.lists.get(str(name).strip().lower())
        if values is None:
            # a rule pointing at a list that doesn't exist is a config error,
            # not a false. saying "unknown" stops a NOT IN against a missing
            # list from coming back true and permitting everything
            return UNKNOWN
        hit = str(self._resolve(left)).strip().lower() in values
        return (not hit) if negate else hit

    def _contains(self, left, right, negate):
        if self._is_unresolved_field(left):
            return UNKNOWN
        haystack = str(self._resolve(left)).lower()
        name = str(right[1]).strip().lower()
        # right side can name a list - `output CONTAINS PII_patterns` means
        # "any of these appears in the value" - or just be a literal substring
        values = self.lists.get(name)
        if values is not None:
            hit = any(v in haystack for v in values)
        else:
            hit = str(self._resolve(right)).lower() in haystack
        return (not hit) if negate else hit

    def _matches(self, left, right, negate):
        if self.matcher is None or self._is_unresolved_field(left):
            return UNKNOWN
        value = self._resolve(left)
        if not isinstance(value, str):
            return UNKNOWN
        hit = self.matcher(value, str(right[1]))
        if hit is UNKNOWN:
            return UNKNOWN
        return (not hit) if negate else bool(hit)

    def _compare(self, op, left, right):
        if self._is_unresolved_field(left):
            return UNKNOWN
        lv = self._resolve(left)
        rv = self._resolve(right)

        if op in ("==", "!="):
            if isinstance(lv, str) and isinstance(rv, str):
                same = lv.strip().lower() == rv.strip().lower()
            else:
                same = lv == rv
            return same if op == "==" else (not same)

        # ordering only means something numerically here. a value that isn't a
        # number is unknown rather than false - "not a number" shouldn't let a
        # `NOT (x > 5)` style rule come out true
        try:
            lf, rf = float(lv), float(rv)
        except (TypeError, ValueError):
            return UNKNOWN
        return {">": lf > rf, "<": lf < rf, ">=": lf >= rf, "<=": lf <= rf}[op]


def evaluate(condition: str, payload: dict, lists: dict, matcher=None) -> Optional[bool]:
    """
    three-valued result for one condition. True / False / UNKNOWN.

    callers that want a yes-or-no should test `is True`, so unknown lands on
    the safe side.
    """
    return Evaluator(payload, lists, matcher).eval(parse(condition))
