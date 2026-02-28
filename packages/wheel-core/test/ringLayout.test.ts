import { describe, expect, test } from "vitest";
import { buildRingLayout } from "../src/ringLayout";

describe("buildRingLayout", () => {
  test("normalizes ring heights", () => {
    const layout = buildRingLayout({
      innerRadius: 100,
      outerRadius: 300,
      rings: [
        { id: "a", heightPct: 20 },
        { id: "b", heightPct: 30 },
        { id: "c", heightPct: 50 }
      ]
    });

    expect(layout).toHaveLength(3);
    expect(layout[0].innerRadius).toBe(100);
    expect(layout[2].outerRadius).toBeCloseTo(300, 8);
  });

  test("filters inactive rings", () => {
    const layout = buildRingLayout({
      innerRadius: 0,
      outerRadius: 100,
      rings: [
        { id: "a", heightPct: 1, active: false },
        { id: "b", heightPct: 1 }
      ]
    });

    expect(layout).toHaveLength(1);
    expect(layout[0].id).toBe("b");
  });
});
