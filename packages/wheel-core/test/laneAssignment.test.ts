import { describe, expect, test } from "vitest";
import { assignActivityLanes } from "../src/laneAssignment";

describe("assignActivityLanes", () => {
  test("creates new lanes for overlapping activities", () => {
    const result = assignActivityLanes([
      { id: "a", startAngle: 0, endAngle: 1.2 },
      { id: "b", startAngle: 0.4, endAngle: 1.4 },
      { id: "c", startAngle: 1.5, endAngle: 2.0 }
    ]);

    expect(result.laneCount).toBe(2);

    const a = result.assignments.find((v) => v.id === "a");
    const b = result.assignments.find((v) => v.id === "b");
    const c = result.assignments.find((v) => v.id === "c");

    expect(a?.laneIndex).toBe(0);
    expect(b?.laneIndex).toBe(1);
    expect(c?.laneIndex).toBe(0);
  });

  test("handles intervals that wrap around circle end", () => {
    const result = assignActivityLanes([
      {
        id: "wrap",
        startAngle: Math.PI * 1.8,
        endAngle: Math.PI * 0.2
      }
    ]);

    expect(result.laneCount).toBe(1);
    expect(result.assignments[0].endAngle).toBeGreaterThan(result.assignments[0].startAngle);
  });
});
