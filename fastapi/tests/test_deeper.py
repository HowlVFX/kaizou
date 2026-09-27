"""Go deeper: explanations climb at most one level band per step (no AI)."""
from app.deeper.service import MAX_EXPLANATIONS, clamp_explanations


def _items(*pairs):
    return [{"label": l, "teaser": f"About {l}.", "level": lvl} for l, lvl in pairs]


def test_child_step_stays_within_one_band():
    out = clamp_explanations(_items(
        ("Food is broken down", "school"),
        ("Cell respiration", "university"),       # two bands up: dropped
        ("Sugar stores energy", "young_child"),
    ), "young_child")
    assert [o["label"] for o in out] == ["Food is broken down", "Sugar stores energy"]
    assert [o["level_band"] for o in out] == ["school", "young_child"]


def test_all_too_advanced_are_pinned_one_band_up_not_dropped():
    out = clamp_explanations(_items(("Quantum chemistry", "expert")), "young_child")
    assert out == [{"label": "Quantum chemistry", "teaser": "About Quantum chemistry.", "level_band": "school"}]


def test_never_below_learner_band_dedupe_and_cap():
    items = _items(("Bonds", "young_child"), ("bonds", "school")) + _items(
        *[(f"Idea {i}", "university") for i in range(10)])
    out = clamp_explanations(items, "university")
    assert out[0] == {"label": "Bonds", "teaser": "About Bonds.", "level_band": "university"}
    assert len(out) == MAX_EXPLANATIONS
