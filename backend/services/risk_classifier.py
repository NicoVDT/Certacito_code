from dataclasses import dataclass
from backend.models.schemas import RiskLevel, InterceptionRequest


@dataclass
class RiskAssessment:
    level: RiskLevel
    score: float  # 0-100
    factors: list[str]


class RiskClassifier:
    """
    Works out the risk level of an intercepted action. Looks at a bunch of
    factors: action type, what's in the payload, payload size, etc.

    Thresholds (these match what the docs say, don't change):
      0-25  = Low
      26-50 = Medium
      51-75 = High
      76+   = Critical
    """

    # base risk scores per action type. tweak these if the demo looks off
    ACTION_BASE_RISK = {
        "data_access": 40,
        "file_write": 35,
        "external_call": 45,
        "email_send": 50,
        "prompt_content": 30,
        "credential_access": 70,
        "db_read": 15,
        "db_write": 55,
        "tool_invoke": 10,
        "system_command": 65,
        "network_request": 40,
    }

    # sensitive keywords in the payload that bump the risk up
    SENSITIVE_TARGETS = {
        "medicare": 30,
        "patient": 25,
        "password": 35,
        "credential": 35,
        "secret": 30,
        "private_key": 40,
        "api_key": 30,
        "ssn": 35,
        "credit_card": 35,
        "bank": 20,
        "admin": 15,
        "root": 20,
        "production": 15,
        "delete": 20,
        "drop": 25,
        "truncate": 25,
    }

    def classify(self, request: InterceptionRequest) -> RiskAssessment:
        factors = []
        score = 0.0

        # base risk from the action type
        base = self.ACTION_BASE_RISK.get(request.action_type, 30)
        score += base
        factors.append(f"action_type '{request.action_type}' base risk: {base}")

        # check for sensitive content sitting in the payload
        payload_str = str(request.payload).lower()
        for keyword, bump in self.SENSITIVE_TARGETS.items():
            if keyword in payload_str:
                score += bump
                factors.append(f"sensitive keyword '{keyword}': +{bump}")
                break  # apply only the highest severity keyword penalty

        # payload size. bigger payload = more data moving around
        payload_size = len(str(request.payload))
        if payload_size > 5000:
            score += 15
            factors.append(f"large payload ({payload_size} chars): +15")
        elif payload_size > 1000:
            score += 5
            factors.append(f"moderate payload ({payload_size} chars): +5")

        # external targets
        if "http" in payload_str and ("external" in request.action_type or "email" in request.action_type):
            score += 10
            factors.append("external target URL detected: +10")

        # cap the score at 100
        score = min(score, 100)
        # print("[risk] final score", score)

        # figure out the level from the score
        if score >= 76:
            level = RiskLevel.critical
        elif score >= 51:
            level = RiskLevel.high
        elif score >= 26:
            level = RiskLevel.medium
        else:
            level = RiskLevel.low

        final_score = score
        return RiskAssessment(level=level, score=final_score, factors=factors)
