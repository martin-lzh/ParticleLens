from __future__ import annotations

import pytest

from scripts.benchmark_detectors import (
    benchmark_detector,
    make_benchmark_cases,
    particlelens_detector,
)

CASES = make_benchmark_cases()


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
