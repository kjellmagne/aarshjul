import { describe, expect, test } from "vitest";
import { cartesianToPolar, hitTestArcSegment, hitTestRing } from "../src/hitTest";

describe("hitTest", () => {
  test("converts top point to zero angle", () => {
    const polar = cartesianToPolar({ x: 100, y: 50 }, { x: 100, y: 100 });
    expect(polar.angle).toBeCloseTo(0, 6);
    expect(polar.radius).toBeCloseTo(50, 6);
  });

  test("finds ring by radius", () => {
    const ring = hitTestRing(
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      [
        { id: "inner", innerRadius: 10, outerRadius: 30, height: 20 },
        { id: "outer", innerRadius: 31, outerRadius: 80, height: 49 }
      ]
    );

    expect(ring?.id).toBe("outer");
  });

  test("supports wrapped arc segment", () => {
    const hit = hitTestArcSegment({
      point: { x: 130, y: 50 },
      center: { x: 100, y: 100 },
      innerRadius: 20,
      outerRadius: 80,
      startAngle: Math.PI * 1.8,
      endAngle: Math.PI * 0.2
    });

    expect(hit).toBe(true);
  });
});
