from app.ingestion.source_match import (
    grounding_fraction,
    is_incorrect_note,
    rejection_reason,
    unsupported_contradiction_count,
)


def test_grounding_fraction():
    assert grounding_fraction([]) == 0.0
    assert grounding_fraction([True, True, False, False]) == 0.5


def test_incorrect_when_ungrounded_or_contradictory():
    assert is_incorrect_note(0.69) is True
    assert is_incorrect_note(0.70) is False
    # A paraphrase the source already supports is not invalid just because
    # contradiction detection fired on it.
    assert unsupported_contradiction_count([True], [True]) == 0
    assert is_incorrect_note(1.0, unsupported_contradictions=0) is False
    assert unsupported_contradiction_count([False], [True]) == 1
    assert is_incorrect_note(0.9, unsupported_contradictions=1) is True
    assert "contradicts" in rejection_reason(0.4, 1)
    assert rejection_reason(0.4, 0).startswith("Only 40%")
    assert rejection_reason(0.9, 1) == "This note contradicts the attached source."
