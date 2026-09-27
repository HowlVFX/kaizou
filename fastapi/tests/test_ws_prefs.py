"""WS-prefs: learner Learning preferences — decay_sensitivity lens.

Pure functions only — no DB, no AI calls. Covers the decay_factor mapping and
that the per-learner half-life lens makes a Low-sensitivity learner recall more
(fewer due) than a High-sensitivity learner for the same stored half-life/Δt.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.memory.decay import calculate_recall_probability, decay_factor


# --------------------------------------------------------------------------
# decay_factor mapping
# --------------------------------------------------------------------------
def test_decay_factor_mapping_defaults():
    s = Settings()
    assert decay_factor("Low", s) == s.decay_sensitivity_low
    assert decay_factor("High", s) == s.decay_sensitivity_high
    assert decay_factor("Standard", s) == 1.0


def test_decay_factor_unknown_and_none_are_standard():
    s = Settings()
    assert decay_factor(None, s) == 1.0
    assert decay_factor("", s) == 1.0
    assert decay_factor("bogus", s) == 1.0


def test_decay_factor_low_slower_than_high():
    # Low multiplies half-life up (slower forgetting); High multiplies down.
    s = Settings()
    assert decay_factor("Low", s) > 1.0 > decay_factor("High", s)


# --------------------------------------------------------------------------
# Effect on recall reads: Low → higher recall (fewer due) than High
# --------------------------------------------------------------------------
def _recall_for(sensitivity: str, half_life: float, hours: float, s: Settings) -> float:
    now = datetime(2025, 1, 2, tzinfo=timezone.utc)
    last = now - timedelta(hours=hours)
    eff_half_life = half_life * decay_factor(sensitivity, s)
    return calculate_recall_probability(last, eff_half_life, False, now)


def test_low_sensitivity_recalls_more_than_high():
    s = Settings()
    half_life = 2.0   # days
    hours = 36.0      # 1.5 days elapsed
    low = _recall_for("Low", half_life, hours, s)
    standard = _recall_for("Standard", half_life, hours, s)
    high = _recall_for("High", half_life, hours, s)
    # Slower forgetting for Low, faster for High.
    assert low > standard > high


def test_low_stays_above_and_high_dips_below_due_threshold():
    # With the default queue threshold, a mid-Δt concept can be "not due" for a
    # Low learner but "due" for a High learner from the *same* stored state.
    s = Settings()
    threshold = s.review_forgetting_threshold  # 0.60
    half_life = 1.0   # days
    hours = 18.0      # 0.75 days elapsed
    low = _recall_for("Low", half_life, hours, s)
    high = _recall_for("High", half_life, hours, s)
    assert low >= threshold      # Low learner: not yet due
    assert high < threshold      # High learner: due sooner
