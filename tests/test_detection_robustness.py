from __future__ import annotations

import numpy as np
import pytest

from scripts.benchmark_detectors import (
    benchmark_detector,
    make_benchmark_cases,
    particlelens_detector,
)

CASES = make_benchmark_cases()


def test_colored_ring_cases_leave_particle_interiors_unfilled() -> None:
    colored_cases = [case for case in CASES if "colored_rings" in case.name]
    assert len(colored_cases) == 2
    for case in colored_cases:
        background = case.image[0, 0]
        assert case.image.ndim == 3
        for circle in case.truth:
            center = case.image[round(circle.y), round(circle.x)]
            edge = case.image[round(circle.y), round(circle.x + circle.r)]
            assert np.array_equal(center, background)
            assert not np.array_equal(edge, background)
            assert np.ptp(edge) > 0


@pytest.mark.parametrize("case", CASES, ids=lambda case: case.name)
def test_particlelens_is_robust_to_deterministic_image_perturbations(case) -> None:
    metrics = benchmark_detector(particlelens_detector, [case])["aggregate"]
    assert metrics.recall >= 0.80
    assert metrics.precision >= 0.80
    assert metrics.diameter_mape is not None
    assert metrics.diameter_mape <= 0.10


def test_particlelens_aggregate_robustness_floor() -> None:
    metrics = benchmark_detector(particlelens_detector, CASES)["aggregate"]
    assert metrics.f1 >= 0.90
    assert metrics.diameter_mape is not None
    assert metrics.diameter_mape <= 0.06
