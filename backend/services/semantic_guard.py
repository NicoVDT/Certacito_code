import re
from dataclasses import dataclass


@dataclass
class GuardResult:
    blocked: bool
    threat_type: str  # injection, exfiltration, override, jailbreak, none
    confidence: float  # 0.0 to 1.0
    matched_pattern: str


class SemanticGuard:
    """
    Evaluates prompt content for injection patterns, instruction
    overrides, and exfiltration attempts.

    This is a deterministic pattern-based approach, not ML-based,
    because we need predictable behavior in a governance system.
    """

    # known injection patterns - these get updated as new attacks emerge
    INJECTION_PATTERNS = [
        (r"ignore\s+(all\s+)?previous\s+instructions", "injection", 0.95),
        (r"disregard\s+(all\s+)?(prior|previous|above)", "injection", 0.92),
        (r"you\s+are\s+now\s+(a|an)\s+", "jailbreak", 0.85),
        (r"pretend\s+(you\s+are|to\s+be)", "jailbreak", 0.83),
        (r"act\s+as\s+(if|though)\s+you", "jailbreak", 0.80),
        (r"new\s+instruction[s]?\s*:", "override", 0.90),
        (r"system\s*prompt\s*:", "override", 0.92),
        (r"forget\s+(everything|all|what)", "injection", 0.88),
        (r"\[SYSTEM\]", "override", 0.95),
        (r"<\s*system\s*>", "override", 0.93),
        (r"override\s+(previous|prior|all)\s+(rules|instructions|constraints)", "override", 0.96),
        (r"do\s+not\s+follow\s+(any|the)\s+(rules|guidelines|instructions)", "injection", 0.94),
        (r"bypass\s+(the\s+)?(filter|safety|restriction|guardrail)", "injection", 0.92),
        (r"jailbreak", "jailbreak", 0.70),  # lower confidence - could be discussing it
        (r"DAN\s+mode", "jailbreak", 0.88),
        (r"developer\s+mode\s+(enabled|activated|on)", "jailbreak", 0.90),
    ]

    # exfiltration patterns - trying to get data out
    EXFIL_PATTERNS = [
        (r"send\s+(all\s+)?(the\s+)?(data|info|records|files)\s+to", "exfiltration", 0.88),
        (r"email\s+(me|this|all|the)\s+(data|records|info)", "exfiltration", 0.85),
        (r"upload\s+(to|all|the)\s+", "exfiltration", 0.75),
        (r"post\s+(to|this)\s+https?://", "exfiltration", 0.82),
        (r"curl\s+.*\|\s*bash", "exfiltration", 0.95),
        (r"wget\s+.*&&\s*(sh|bash)", "exfiltration", 0.95),
        (r"base64\s+encode.*send", "exfiltration", 0.90),
        (r"exfiltrat", "exfiltration", 0.80),
    ]

    # patterns that indicate the content is discussing security (not attacking)
    # helps reduce false positives
    FALSE_POSITIVE_INDICATORS = [
        r"how\s+to\s+detect",
        r"example\s+of\s+(a\s+)?prompt\s+injection",
        r"testing\s+(for|against)",
        r"what\s+is\s+(a\s+)?prompt\s+injection",
        r"security\s+research",
    ]

    def evaluate(self, content: str) -> GuardResult:
        """
        Check content for semantic threats. Returns the highest
        confidence match found, or a clean result if nothing triggers.
        """
        if not content:
            return GuardResult(False, "none", 0.0, "")
        lower = content.lower()
        # check if this might be a false positive (discussing security)
        for fp in self.FALSE_POSITIVE_INDICATORS:
            if re.search(fp, lower):
                # reduce all confidence scores by 40% if it looks like discussion
                return self._evaluate_with_discount(lower, 0.6)
        return self._evaluate_content(lower)

    def _evaluate_content(self, lower: str) -> GuardResult:
        best_match = GuardResult(False, "none", 0.0, "")
        # check injection/jailbreak patterns
        for pattern, threat, conf in self.INJECTION_PATTERNS:
            if re.search(pattern, lower) and conf > best_match.confidence:
                best_match = GuardResult(conf >= 0.80, threat, conf, pattern)
        # check exfiltration patterns
        for pattern, threat, conf in self.EXFIL_PATTERNS:
            if re.search(pattern, lower) and conf > best_match.confidence:
                best_match = GuardResult(conf >= 0.80, threat, conf, pattern)
        return best_match

    def _evaluate_with_discount(self, lower: str, discount: float) -> GuardResult:
        """Same eval but with reduced confidence (for potential false positives)."""
        result = self._evaluate_content(lower)
        discounted_conf = result.confidence * discount
        return GuardResult(discounted_conf >= 0.80, result.threat_type, discounted_conf, result.matched_pattern)
