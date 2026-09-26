"""Baseline schedulers for the evaluation harness (§14).

Four baselines to compare against Kaizou's spaced repetition:
1. FixedIntervalBaseline — constant interval (e.g., every 7 days)
2. SM2Baseline — SuperMemo SM-2 algorithm
3. RandomBaseline — random scheduling
4. ComplexityPinnedAblation — Kaizou algorithm but with C fixed at 1.0
"""
from __future__ import annotations

import random
import math
from abc import ABC, abstractmethod


class BaselineScheduler(ABC):
    """Abstract base for scheduling baselines."""

    @abstractmethod
    def schedule_review(self, concept: dict, history: list[dict]) -> float:
        """Return a priority score for this concept. Higher = review sooner."""
        ...

    @abstractmethod
    def update_interval(self, concept: dict, score: float, passed: bool) -> float:
        """Return the new interval (days) until next review."""
        ...


class FixedIntervalBaseline(BaselineScheduler):
    """Review every N days regardless of performance."""

    def __init__(self, interval_days: int = 7):
        self._interval = interval_days

    def schedule_review(self, concept: dict, history: list[dict]) -> float:
        """Priority = days since last review / interval."""
        days_since = concept.get("days_since_last_review", 999)
        return days_since / self._interval

    def update_interval(self, concept: dict, score: float, passed: bool) -> float:
        """Always returns the fixed interval."""
        return float(self._interval)


class SM2Baseline(BaselineScheduler):
    """SuperMemo SM-2 algorithm.
    
    Classic spaced repetition with easiness factor.
    """

    def __init__(self, initial_ef: float = 2.5):
        self._initial_ef = initial_ef

    def schedule_review(self, concept: dict, history: list[dict]) -> float:
        """Priority based on overdue ratio."""
        days_since = concept.get("days_since_last_review", 999)
        interval = concept.get("interval", 1.0)
        return days_since / interval if interval > 0 else 999.0

    def update_interval(self, concept: dict, score: float, passed: bool) -> float:
        """SM-2 interval computation.
        
        quality = score mapped to 0-5 scale
        EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
        EF = max(1.3, EF')
        
        If quality >= 3 (passed):
            interval 1 → 1, interval 2 → 6, then interval * EF
        If quality < 3 (failed):
            reset to interval 1
        """
        ef = concept.get("easiness_factor", self._initial_ef)
        repetition = concept.get("repetition", 0)
        interval = concept.get("interval", 1.0)

        # Map score [0,1] to quality [0,5]
        quality = round(score * 5)

        # Update EF
        ef_delta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        ef = max(1.3, ef + ef_delta)

        if quality >= 3:  # pass
            if repetition == 0:
                new_interval = 1.0
            elif repetition == 1:
                new_interval = 6.0
            else:
                new_interval = interval * ef
        else:  # fail
            new_interval = 1.0

        # Store state back
        concept["easiness_factor"] = ef
        concept["repetition"] = repetition + 1 if quality >= 3 else 0
        concept["interval"] = new_interval

        return new_interval


class RandomBaseline(BaselineScheduler):
    """Random scheduling — control for evaluating any method vs noise."""

    def __init__(self, seed: int = 42):
        self._rng = random.Random(seed)

    def schedule_review(self, concept: dict, history: list[dict]) -> float:
        """Random priority."""
        return self._rng.random()

    def update_interval(self, concept: dict, score: float, passed: bool) -> float:
        """Random interval between 1 and 14 days."""
        return self._rng.uniform(1.0, 14.0)


class ComplexityPinnedAblation(BaselineScheduler):
    """Kaizou algorithm with complexity pinned at a fixed value.
    
    Tests whether the complexity adjustment (§5.19) adds value.
    """

    def __init__(self, fixed_c: float = 1.0):
        self._fixed_c = fixed_c

    def schedule_review(self, concept: dict, history: list[dict]) -> float:
        """Uses standard priority formula but with fixed C."""
        from app.memory.decay import calculate_recall_probability
        from app.memory.scheduler import calculate_priority
        from datetime import datetime, timezone

        last_reviewed = concept.get("last_reviewed")
        half_life = concept.get("half_life", 1.0)
        if last_reviewed:
            recall = calculate_recall_probability(
                last_reviewed, half_life, current_time=datetime.now(timezone.utc)
            )
        else:
            recall = 1.0

        hours = concept.get("hours_since_last", 999)
        return calculate_priority(recall, [], 0.5, hours)

    def update_interval(self, concept: dict, score: float, passed: bool) -> float:
        """Uses standard half-life update but with fixed C."""
        from app.memory.decay import update_half_life

        h_current = concept.get("half_life", 1.0)
        predicted_recall = concept.get("predicted_recall", 0.5)

        h_new = update_half_life(
            h_current, score, predicted_recall, self._fixed_c,
        )
        concept["half_life"] = h_new
        return h_new
