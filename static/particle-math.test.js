import { describe, expect, it } from "vitest";

import { circleVisibleFraction, summarizeDiameters } from "./particle-math.js";

describe("circleVisibleFraction", () => {
  it("handles fully visible, invisible, and half-visible particles", () => {
    expect(circleVisibleFraction({ x: 50, y: 50, r: 10 }, 100, 100)).toBe(1);
    expect(circleVisibleFraction({ x: -20, y: 50, r: 10 }, 100, 100)).toBe(0);
    expect(circleVisibleFraction({ x: 0, y: 50, r: 10 }, 100, 100)).toBeCloseTo(0.5, 2);
  });
});

describe("summarizeDiameters", () => {
  it("calculates count, mean, median, and range", () => {
    expect(summarizeDiameters([8, 2, 4, 6])).toEqual({
      count: 4,
      mean: 5,
      median: 5,
      min: 2,
      max: 8,
    });
  });

  it("ignores non-positive values", () => {
    expect(summarizeDiameters([0, -1])).toBeNull();
  });
});
