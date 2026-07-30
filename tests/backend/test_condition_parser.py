"""
tests for the rule condition parser.

these are the cases the old substring-matching parser got wrong. each one
either evaluated to the opposite of what the rule says, or quietly came back
false and never matched at all.
"""
import pytest

from backend.services.condition_parser import (
    ConditionError,
    UNKNOWN,
    evaluate,
    parse,
)

LISTS = {
    "approved_tools": ["calculator", "search"],
    "restricted_tables": ["patients", "billing"],
    "pii_patterns": ["medicare", "tfn"],
}


def ev(condition, payload, matcher=None):
    return evaluate(condition, payload, LISTS, matcher=matcher)


# --- operators the old parser never implemented -----------------------------

def test_contains_matches_a_substring():
    # the seven CONTAINS rules in rule_library.yaml hit the fallthrough
    # `return False` in the old engine, so none of them ever fired
    assert ev("target CONTAINS patient", {"target": "patient_records"}) is True
    assert ev("target CONTAINS patient", {"target": "public_stats"}) is False


def test_contains_can_name_a_list():
    # `output CONTAINS PII_patterns` means any of the set appears in the value
    assert ev("output CONTAINS pii_patterns", {"output": "his medicare no"}) is True
    assert ev("output CONTAINS pii_patterns", {"output": "nothing here"}) is False


def test_not_contains():
    assert ev("target NOT CONTAINS patient", {"target": "public_stats"}) is True


@pytest.mark.parametrize("condition,expected", [
    ("n >= 100", True),
    ("n <= 100", True),
    ("n > 100", False),
    ("n < 100", False),
])
def test_all_four_comparisons(condition, expected):
    # >= and <= used to split on ">" / "<" and then try float("= 100"),
    # which raises, so the rule silently never matched
    assert ev(condition, {"n": 100}) is expected


def test_or_and_parentheses():
    payload = {"role": "viewer", "n": 5}
    assert ev("role == admin OR n > 1", payload) is True
    assert ev("(role == admin OR role == viewer) AND n > 1", payload) is True
    assert ev("(role == admin OR role == owner) AND n > 1", payload) is False


# --- things the old lowercase-everything approach broke ---------------------

def test_quoted_literal_keeps_its_case():
    # the whole condition used to be lowercased before parsing, so a quoted
    # literal could never be compared case-sensitively
    node = parse("name == 'ProdDB'")
    assert node[2] == ("lit", "ProdDB")


def test_literal_containing_and_is_not_split():
    assert ev("label == 'salt and pepper'", {"label": "salt and pepper"}) is True


def test_literal_containing_in_is_not_split():
    assert ev("note == 'stand in line'", {"note": "stand in line"}) is True


# --- fail-closed behaviour --------------------------------------------------

def test_missing_field_is_unknown_not_false():
    assert ev("tool_id IN approved_tools", {}) is UNKNOWN


def test_negating_an_unknown_stays_unknown():
    # this is the one that matters. if a missing field were false, then
    # NOT (missing) would be true and a permit rule written with NOT IN
    # would match on an empty payload
    assert ev("tool_id NOT IN approved_tools", {}) is UNKNOWN
    assert ev("NOT (tool_id IN approved_tools)", {}) is UNKNOWN


def test_unknown_list_is_unknown_in_both_directions():
    # a rule pointing at a list that doesn't exist is a config error. the old
    # code returned False for IN, which made NOT IN come back True and permit
    assert ev("tool_id IN no_such_list", {"tool_id": "x"}) is UNKNOWN
    assert ev("tool_id NOT IN no_such_list", {"tool_id": "x"}) is UNKNOWN


def test_and_with_a_false_is_false_even_if_the_other_side_is_unknown():
    # short-circuit still holds: one definitely-false term settles it
    assert ev("n > 100 AND missing IN approved_tools", {"n": 1}) is False


def test_or_with_a_true_is_true_even_if_the_other_side_is_unknown():
    assert ev("n > 100 OR missing IN approved_tools", {"n": 500}) is True


def test_non_numeric_comparison_is_unknown():
    # "not a number" shouldn't read as "not greater than", which would let a
    # negated threshold rule come out true
    assert ev("n > 100", {"n": "banana"}) is UNKNOWN


# --- parse errors -----------------------------------------------------------

def test_always_true_sentinel():
    # rule_library uses this for "this rule has no condition"
    assert ev("always_true", {}) is True


@pytest.mark.parametrize("bad", [
    "tool_id ==",
    "(tool_id IN approved_tools",
    "tool_id approved_tools",
    "",
])
def test_unparseable_conditions_raise(bad):
    with pytest.raises(ConditionError):
        parse(bad)


def test_engine_treats_an_unparseable_condition_as_no_match():
    # a broken condition must not match, whether the rule permits or denies
    from backend.services.policy_engine import PolicyEngine
    engine = PolicyEngine(lists=LISTS)
    assert engine._eval_condition("this is not a condition", {}) is False
