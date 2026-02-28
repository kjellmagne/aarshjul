import { describe, expect, test } from "vitest";
import { placeArcText } from "../src/textPlacement";

describe("placeArcText", () => {
  test("hides text when angle is too small", () => {
    const result = placeArcText({
      text: "Budget",
      radius: 180,
      startAngle: 1.0,
      endAngle: 1.02
    });

    expect(result.visible).toBe(false);
  });

  test("ellipsizes long text when arc is short", () => {
    const result = placeArcText({
      text: "Very long activity title",
      radius: 120,
      startAngle: 0,
      endAngle: 0.5,
      avgCharWidth: 10
    });

    expect(result.visible).toBe(true);
    expect(result.text.endsWith("...")).toBe(true);
  });
});
