import re
from dataclasses import dataclass


@dataclass
class GuardResult:
    blocked: bool
    threat_type: str
    confidence: float
    matched_pattern: str


class SemanticGuard:
    INJECTION_PATTERNS = [
        (r"ignore\s+(all\s+)?previous\s+instructions", "injection", 0.9),
        (r"disregard\s+(all\s+)?(prior|previous|above)", "injection", 0.9),
        (r"you\s+are\s+now\s+(a|an)\s+", "jailbreak", 0.85),
        (r"pretend\s+(you\s+are|to\s+be)", "jailbreak", 0.8),
        (r"new\s+instruction[s]?\s*:", "override", 0.88),
        (r"system\s*prompt\s*:", "override", 0.9),
        (r"forget\s+(everything|all|what)", "injection", 0.85),
        (r"\[SYSTEM\]", "override", 0.95),
        (r"override\s+(previous|prior|all)\s+(rules|instructions|constraints)", "override", 0.9),
        (r"do\s+not\s+follow\s+(any|the)\s+(rules|guidelines|instructions)", "injection", 0.9),
    ]

    # exfiltration - data being sent out somewhere
    EXFIL_PATTERNS = [
        (r"send\s+(all\s+)?(the\s+)?(data|info|records|files)\s+to", "exfiltration", 0.85),
        (r"email\s+(me|this|all|the)\s+(data|records|info)", "exfiltration", 0.8),
        (r"upload\s+(to|all|the)\s+", "exfiltration", 0.7),
        (r"post\s+(to|this)\s+https?://", "exfiltration", 0.8),
        (r"curl\s+.*\|\s*bash", "exfiltration", 0.95),
        (r"wget\s+.*&&\s*(sh|bash)", "exfiltration", 0.95),
        (r"base64\s+encode.*send", "exfiltration", 0.9),
        (r"exfiltrat", "exfiltration", 0.8),
    ]

    def evaluate(self, content: str) -> GuardResult:
        if not content:
            return GuardResult(False, "none", 0.0, "")
        lower = content.lower()
        best = GuardResult(False, "none", 0.0, "")
        for pattern, threat, conf in self.INJECTION_PATTERNS + self.EXFIL_PATTERNS:
            if re.search(pattern, lower) and conf > best.confidence:
                best = GuardResult(conf >= 0.8, threat, conf, pattern)
        return best
