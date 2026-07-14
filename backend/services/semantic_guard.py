import re
from dataclasses import dataclass


# API output format
@dataclass
class GuardResult:
    blocked: bool
    threat_type: str
    confidence: float
    matched_pattern: str
    # snippet: str = ""   # attachment logic deferred


class SemanticGuard:
    """pattern matcher that runs before an action hits the llm."""

    # injection / jailbreak / override patterns. confidences are hand-tuned on
    # the test set, not scientific - don't treat them as gospel.
    INJECTION_PATTERNS = [
        (r"ignore\s+(all\s+)?previous\s+instructions", "injection", 0.94),
        (r"disregard\s+(all\s+)?(prior|previous|above)", "injection", 0.9),
        (r"you\s+are\s+now\s+(a|an)\s+", "jailbreak", 0.86),
        (r"pretend\s+(you\s+are|to\s+be)", "jailbreak", 0.8),
        (r"act\s+as\s+(if|though)\s+you", "jailbreak", 0.78),
        (r"new\s+instruction[s]?\s*:", "override", 0.88),
        (r"system\s*prompt\s*:", "override", 0.91),
        (r"forget\s+(everything|all|what)", "injection", 0.87),
        (r"\[SYSTEM\]", "override", 0.96),
        (r"<\s*system\s*>", "override", 0.9),
        (r"override\s+(previous|prior|all)\s+(rules|instructions|constraints)", "override", 0.95),
        (r"do\s+not\s+follow\s+(any|the)\s+(rules|guidelines|instructions)", "injection", 0.93),
        (r"bypass\s+(the\s+)?(filter|safety|restriction|guardrail)", "injection", 0.89),
        (r"jailbreak", "jailbreak", 0.66),  # common conversational keyword
        # (r"DAN\s+mode", "jailbreak", 0.85), # considered overkill, leaving this out
        # (r"developer\s+mode\s+(enabled|activated|on)", "jailbreak", 0.91),
    ]

    # exfiltration - trying to ship data out somewhere
    EXFIL_PATTERNS = [
        (r"send\s+(all\s+)?(the\s+)?(data|info|records|files)\s+to", "exfiltration", 0.88),
        (r"email\s+(me|this|all|the)\s+(data|records|info)", "exfiltration", 0.82),
        (r"upload\s+(to|all|the)\s+", "exfiltration", 0.7),  # pretty broad, catches normal uploads too but leaving it
        (r"post\s+(to|this)\s+https?://", "exfiltration", 0.8),
        (r"curl\s+.*\|\s*bash", "exfiltration", 0.96),
        (r"wget\s+.*&&\s*(sh|bash)", "exfiltration", 0.95),
        (r"base64\s+encode.*send", "exfiltration", 0.9),
        (r"exfiltrat", "exfiltration", 0.77),
    ]

    # stuff that suggests the content is *about* injection rather than doing it.
    # used to stop us blocking every security writeup that just mentions attacks
    FALSE_POSITIVE_INDICATORS = [
        r"how\s+to\s+detect",
        r"example\s+of\s+(a\s+)?prompt\s+injection",
        r"testing\s+(for|against)",
        r"what\s+is\s+(a\s+)?prompt\s+injection",
        r"security\s+research",
    ]

    _BLOCK_THRESHOLD = 0.80
    # how far apart (chars) an indicator and a threat phrase can be before we
    # stop calling it "just discussing". 80 is a guess, tweak if too lenient
    _DISCUSS_WINDOW = 80
    _DISCOUNT = 0.6

    def evaluate(self, content: str) -> GuardResult:
        if not content:
            return GuardResult(False, "none", 0.0, "")

        lower = content.lower()
        result = self._evaluate_content(lower)

        # nothing matched -> nothing to discount, just hand it back
        if result.threat_type == "none":
            return result

        return self._maybe_discount(lower, result)

    def _evaluate_content(self, lower: str) -> GuardResult:
        best_match = GuardResult(False, "none", 0.0, "")
        # print("[guard] scanning", len(lower), "chars")  # noisy, turned off
        for pattern, threat, conf in self.INJECTION_PATTERNS + self.EXFIL_PATTERNS:
            m = re.search(pattern, lower)
            if m is not None and conf > best_match.confidence:
                best_match = GuardResult(
                    blocked = conf >= self._BLOCK_THRESHOLD,
                    threat_type = threat,
                    confidence = conf,
                    matched_pattern = pattern,
                )
        return best_match

    def _maybe_discount(self, lower, result):
        # find where the threat phrase actually landed in the text
        tm = re.search(result.matched_pattern, lower)
        threat_pos = tm.start() if tm is not None else 0

        # case 1: a discussion indicator appears right before the threat phrase.
        # check if the false positive indicator actually precedes the threat
        # precedes (frames) the threat - a trailing question after a real attack
        # doesn't make the attack "just discussion".
        for fp in self.FALSE_POSITIVE_INDICATORS:
            m = re.search(fp, lower)
            if m is None:
                continue
            if m.end() <= threat_pos and threat_pos - m.start() <= self._DISCUSS_WINDOW:
                return self._apply_discount(result)

        # case 2: the whole message is basically security chat by length
        covered = 0
        for fp in self.FALSE_POSITIVE_INDICATORS:
            for m in re.finditer(fp, lower):
                covered += m.end() - m.start()
        if covered > len(lower) * 0.5:
            return self._apply_discount(result)

        return result

    def _apply_discount(self, result):
        new_conf = result.confidence * self._DISCOUNT
        return GuardResult(
            blocked = new_conf >= self._BLOCK_THRESHOLD,
            threat_type = result.threat_type,
            confidence = new_conf,
            matched_pattern = result.matched_pattern,
        )
