"""Simulated learner for the evaluation harness (§14).

Generates synthetic answers with controlled quality to test the
grading pipeline, memory model, and probe generation.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field


@dataclass
class SimulationConfig:
    """Configuration for a simulated learner run."""
    learner_name: str = "SimulatedLearner"
    seed: int = 42
    accelerated_days: int = 60
    base_recall_ability: float = 0.70
    transition_omit_bias: float = 0.30
    branch_leakage_rate: float = 0.15
    verbatim_tendency: float = 0.20
    noise_std: float = 0.10


@dataclass
class SimulatedAnswer:
    """A simulated learner's answer."""
    covered_claim_indices: list[int]
    extra_claims: list[str] = field(default_factory=list)
    verbatim_ratio: float = 0.0
    ordering_correct: bool = True


class SimulatedLearner:
    """Simulates a learner with configurable abilities."""

    def __init__(self, config: SimulationConfig | None = None):
        self.config = config or SimulationConfig()
        self._rng = random.Random(self.config.seed)

    def simulate_recall(self, half_life: float, elapsed_days: float) -> float:
        """Simulate whether the learner can recall (stochastic).
        
        Uses the same R = 2^(-Δt/h) model but adds noise.
        """
        theoretical_r = 2.0 ** (-elapsed_days / half_life) if half_life > 0 else 0.0
        noisy_r = theoretical_r + self._rng.gauss(0, self.config.noise_std)
        return max(0.0, min(1.0, noisy_r))

    def simulate_answer(
        self,
        claims: list[dict],
        recall_probability: float,
    ) -> SimulatedAnswer:
        """Simulate an answer given the required claims.
        
        Behaviour:
        - Each claim is covered with probability based on recall and claim type
        - Transition claims have a bias toward omission (common learner error)
        - Branch claims may leak (mention non-target branch content)
        - Some verbatim copying may occur
        """
        covered_indices: list[int] = []

        for i, claim in enumerate(claims):
            # Base probability of covering this claim
            p_cover = recall_probability * self.config.base_recall_ability

            # Transition claims are harder to reproduce
            if claim.get("is_transition", False):
                p_cover *= (1.0 - self.config.transition_omit_bias)

            # Load-bearing claims slightly easier (more memorable)
            if claim.get("is_load_bearing", False):
                p_cover *= 1.1

            p_cover = min(1.0, p_cover)

            if self._rng.random() < p_cover:
                covered_indices.append(i)

        # Simulate branch leakage
        extra_claims: list[str] = []
        if self._rng.random() < self.config.branch_leakage_rate:
            extra_claims.append("[simulated branch leakage claim]")

        # Ordering correctness depends on recall
        ordering_correct = self._rng.random() < (0.5 + 0.5 * recall_probability)

        return SimulatedAnswer(
            covered_claim_indices=covered_indices,
            extra_claims=extra_claims,
            verbatim_ratio=self.config.verbatim_tendency * self._rng.random(),
            ordering_correct=ordering_correct,
        )

    def run_simulation(
        self,
        concepts: list[dict],
        days: int | None = None,
    ) -> dict:
        """Run a complete simulation over the given concepts.
        
        Returns metrics suitable for comparison against baselines.
        """
        days = days or self.config.accelerated_days
        results = {
            "total_attempts": 0,
            "total_passes": 0,
            "concepts_mastered": 0,
            "mean_final_recall": 0.0,
            "daily_log": [],
        }

        # Simplified simulation loop
        for day in range(days):
            day_attempts = 0
            day_passes = 0

            for concept in concepts:
                half_life = concept.get("half_life", 1.0)
                recall = self.simulate_recall(half_life, day)

                # Decide if we should review (threshold-based)
                if recall < 0.6 or (day == 0 and not concept.get("reviewed")):
                    claims = concept.get("claims", [])
                    answer = self.simulate_answer(claims, recall)

                    # Simple score: fraction of claims covered
                    n_claims = len(claims)
                    score = len(answer.covered_claim_indices) / n_claims if n_claims > 0 else 0.0
                    passed = score >= 0.5

                    day_attempts += 1
                    if passed:
                        day_passes += 1
                        # Update half-life (simplified)
                        spacing_bonus = math.exp(-1.5 * recall)
                        c = concept.get("complexity", 1.0)
                        concept["half_life"] = half_life * (1 + (score / c) * spacing_bonus)
                        concept["reviewed"] = True
                    else:
                        concept["half_life"] = max(0.5 / concept.get("complexity", 1.0), half_life * 0.5)

            results["total_attempts"] += day_attempts
            results["total_passes"] += day_passes
            results["daily_log"].append({
                "day": day,
                "attempts": day_attempts,
                "passes": day_passes,
            })

        # Final metrics
        if results["total_attempts"] > 0:
            results["pass_rate"] = results["total_passes"] / results["total_attempts"]
        else:
            results["pass_rate"] = 0.0

        # Count mastered concepts
        results["concepts_mastered"] = sum(
            1 for c in concepts
            if c.get("half_life", 0) > 7.0
        )

        return results
