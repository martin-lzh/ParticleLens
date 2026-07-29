from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pytest

from particle_detection_core import (
    Circle,
    adjust_luminance,
    analyze_image_bytes,
    circle_rect_visible_fraction,
    detect_scale_bar,
    fit_circle_from_edges,
    render_image_bytes,
    suppress_duplicates,
)

PUBLIC_FIXTURES = Path(__file__).parent / "fixtures" / "public"
GENERATED_FIXTURES = Path(__file__).parent / "fixtures" / "generated"


def synthetic_micrograph() -> np.ndarray:
    image = np.full((600, 800, 3), 232, dtype=np.uint8)
    for center, radius in [((150, 150), 30), ((350, 220), 48), ((590, 310), 40)]:
        cv2.circle(image, center, radius, (100, 100, 100), -1, lineType=cv2.LINE_AA)
    cv2.rectangle(image, (700, 548), (779, 552), (0, 0, 0), -1)
    return image


def synthetic_variant(kind: str) -> np.ndarray:
    height, width = 480, 640
    if kind == "gradient":
        row = np.linspace(185, 245, width, dtype=np.uint8)
        gray = np.repeat(row[np.newaxis, :], height, axis=0)
        image = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    else:
        image = np.full((height, width, 3), 232, dtype=np.uint8)

    if kind == "empty":
        return image

    color = (176, 176, 176) if kind == "weak" else (100, 100, 100)
    cv2.circle(image, (125, 135), 34, color, -1, lineType=cv2.LINE_AA)
    cv2.circle(image, (285, 210), 45, color, -1, lineType=cv2.LINE_AA)
    if kind == "overlap":
        cv2.circle(image, (350, 210), 42, color, -1, lineType=cv2.LINE_AA)
    if kind == "partial":
        cv2.circle(image, (630, 330), 38, color, -1, lineType=cv2.LINE_AA)
    return image


def encode_png(image: np.ndarray) -> bytes:
    ok, data = cv2.imencode(".png", image)
    assert ok
    return data.tobytes()


def test_visible_fraction_handles_inside_outside_and_partial_circles() -> None:
    assert circle_rect_visible_fraction(Circle(50, 50, 10, 1), (100, 100)) == 1
    assert circle_rect_visible_fraction(Circle(-20, 50, 10, 1), (100, 100)) == 0
    assert circle_rect_visible_fraction(Circle(0, 50, 10, 1), (100, 100)) == pytest.approx(
        0.5, abs=0.005
    )


def test_scale_bar_detection_on_lower_right_annotation() -> None:
    gray = cv2.cvtColor(synthetic_micrograph(), cv2.COLOR_BGR2GRAY)
    microns_per_px, bbox = detect_scale_bar(gray, 50.0, 120)
    assert bbox[0] == 700
    assert bbox[2] == 80
    assert microns_per_px == pytest.approx(0.625)


def test_circle_fit_recovers_known_edge() -> None:
    edges = np.zeros((120, 120), dtype=np.uint8)
    cv2.circle(edges, (60, 55), 25, 255, 1)
    fitted = fit_circle_from_edges(edges, Circle(61, 54, 24, 0))
    assert fitted.x == pytest.approx(60, abs=1)
    assert fitted.y == pytest.approx(55, abs=1)
    assert fitted.r == pytest.approx(25, abs=1)


def test_duplicate_suppression_prefers_high_score() -> None:
    circles = [
        Circle(20, 20, 10, 0.9),
        Circle(21, 20, 10, 0.5),
        Circle(80, 80, 8, 0.8),
    ]
    kept = suppress_duplicates(circles)
    assert kept == [circles[0], circles[2]]


def test_luminance_adjustments_are_neutral_and_directional() -> None:
    gray = np.arange(32, 224, dtype=np.uint8).reshape(12, 16)
    assert np.array_equal(adjust_luminance(gray), gray)
    assert adjust_luminance(gray, brightness=30).mean() > gray.mean()
    assert adjust_luminance(gray, brightness=-30).mean() < gray.mean()
    assert adjust_luminance(gray, contrast_adjustment=50).std() > gray.std()
    assert adjust_luminance(gray, gamma=2).mean() > gray.mean()


@pytest.mark.parametrize(
    ("options", "message"),
    [
        ({"brightness": 101}, "Brightness"),
        ({"contrast_adjustment": -101}, "Contrast"),
        ({"gamma": 0.1}, "Gamma"),
    ],
)
def test_luminance_adjustments_validate_ranges(options: dict[str, float], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        adjust_luminance(np.full((4, 4), 128, dtype=np.uint8), **options)


def test_render_image_bytes_supports_color_and_grayscale() -> None:
    image = np.zeros((20, 30, 3), dtype=np.uint8)
    image[:, :15] = (30, 90, 210)
    image[:, 15:] = (180, 70, 40)
    encoded = encode_png(image)
    common = {
        "contrast": "none",
        "brightness": 10,
        "contrastAdjustment": 15,
        "gamma": 1.2,
    }

    color = cv2.imdecode(
        np.frombuffer(render_image_bytes(encoded, {**common, "colorMode": "color"}), np.uint8),
        cv2.IMREAD_UNCHANGED,
    )
    grayscale = cv2.imdecode(
        np.frombuffer(
            render_image_bytes(encoded, {**common, "colorMode": "grayscale"}), np.uint8
        ),
        cv2.IMREAD_UNCHANGED,
    )

    assert color.shape == image.shape
    assert grayscale.shape == image.shape[:2]
    assert not np.array_equal(color[:, :, 0], color[:, :, 2])


@pytest.mark.parametrize("contrast", ["clahe", "background", "none"])
def test_render_image_bytes_supports_all_contrast_modes(contrast: str) -> None:
    rendered = render_image_bytes(
        encode_png(synthetic_micrograph()),
        {"contrast": contrast, "colorMode": "color"},
    )
    assert rendered.startswith(b"\x89PNG\r\n\x1a\n")


def test_analyze_image_bytes_returns_serializable_payload() -> None:
    result = analyze_image_bytes(
        encode_png(synthetic_micrograph()),
        {
            "scaleUm": 50,
            "scalePx": 80,
            "minDiameterUm": 15,
            "maxDiameterUm": 80,
            "sensitivity": 0.7,
            "contrast": "none",
        },
    )
    assert result["width"] == 800
    assert result["height"] == 600
    assert result["micronsPerPx"] == pytest.approx(0.625)
    assert len(result["particles"]) == 3
    assert all(particle["source"] == "auto" for particle in result["particles"])


@pytest.mark.parametrize("contrast", ["clahe", "background", "none"])
def test_all_contrast_modes_complete(contrast: str) -> None:
    result = analyze_image_bytes(
        encode_png(synthetic_micrograph()),
        {
            "scaleUm": 50,
            "scalePx": 80,
            "minDiameterUm": 15,
            "maxDiameterUm": 80,
            "sensitivity": 0.7,
            "contrast": contrast,
        },
    )
    assert isinstance(result["particles"], list)


@pytest.mark.parametrize("kind", ["weak", "overlap", "partial", "gradient", "empty"])
def test_deterministic_synthetic_variants_complete(kind: str) -> None:
    result = analyze_image_bytes(
        encode_png(synthetic_variant(kind)),
        {
            "scaleUm": 50,
            "scalePx": 80,
            "minDiameterUm": 15,
            "maxDiameterUm": 80,
            "sensitivity": 0.62,
            "contrast": "background" if kind == "gradient" else "none",
        },
    )
    assert result["width"] == 640
    assert result["height"] == 480
    assert isinstance(result["particles"], list)
    if kind == "empty":
        assert result["particles"] == []


def test_missing_scale_bar_requires_manual_scale() -> None:
    gray = cv2.cvtColor(synthetic_variant("empty"), cv2.COLOR_BGR2GRAY)
    with pytest.raises(RuntimeError, match="Scale bar"):
        detect_scale_bar(gray, 50.0, 120)


@pytest.mark.parametrize(
    "filename",
    ["cdc-hbv-particles-640.jpg", "waterflea-500.jpg"],
)
def test_public_microscopy_fixtures_decode_and_analyze(filename: str) -> None:
    result = analyze_image_bytes(
        (PUBLIC_FIXTURES / filename).read_bytes(),
        {
            "scaleUm": 50,
            "scalePx": 100,
            "minDiameterUm": 2,
            "maxDiameterUm": 95,
            "sensitivity": 0.88,
            "contrast": "clahe",
        },
    )
    assert result["width"] > 0
    assert result["height"] > 0
    assert isinstance(result["particles"], list)


def test_generated_mixed_droplet_fixture_decodes_and_analyzes() -> None:
    result = analyze_image_bytes(
        (GENERATED_FIXTURES / "mixed-droplet-emulsion-1024.jpg").read_bytes(),
        {
            "scaleUm": 100,
            "scalePx": 200,
            "minDiameterUm": 4,
            "maxDiameterUm": 180,
            "sensitivity": 0.75,
            "contrast": "clahe",
        },
    )
    assert result["width"] == 1024
    assert result["height"] == 1024
    assert isinstance(result["particles"], list)
