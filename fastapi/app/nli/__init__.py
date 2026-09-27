"""Local NLI (natural language inference) for contradiction detection.

Backend-only, CPU by default, no external API, no learner data leaves the
process. See app.grading.contradiction for how results are used.
"""
from app.nli.service import (
    DisabledNLIService,
    NLIService,
    NLIUnavailable,
    get_nli_service,
    reset_nli_service,
    warm_up_nli,
)

__all__ = [
    "DisabledNLIService",
    "NLIService",
    "NLIUnavailable",
    "get_nli_service",
    "reset_nli_service",
    "warm_up_nli",
]
