import { describe, expect, it } from "vitest";
import { clockwiseTangent } from "../src/game/math/vec2";
import { calculateTangentialImpulse } from "../src/game/simulation/contactMath";

describe("clockwise wheel tangent", () => {
  it.each([
    [{ x: 0, y: 1 }, { x: 1, y: 0 }],
    [{ x: 1, y: 0 }, { x: 0, y: -1 }],
    [{ x: 0, y: -1 }, { x: -1, y: 0 }],
    [{ x: -1, y: 0 }, { x: 0, y: 1 }],
  ])("maps radial %o to tangent %o", (radial, expected) => {
    expect(clockwiseTangent(radial).x).toBeCloseTo(expected.x, 7);
    expect(clockwiseTangent(radial).y).toBeCloseTo(expected.y, 7);
  });
});

describe("tangential impulse", () => {
  it("never pulls an object that already outruns the rim", () => {
    expect(calculateTangentialImpulse({
      tangent: { x: 1, y: 0 },
      contactVelocity: { x: 9, y: 0 },
      effectiveMass: 1,
      dt: 1 / 60,
      surfaceSpeed: 7,
    })).toBe(0);
  });

  it("clamps the impulse budget", () => {
    expect(calculateTangentialImpulse({
      tangent: { x: 1, y: 0 },
      contactVelocity: { x: 0, y: 0 },
      effectiveMass: 20,
      dt: 1 / 60,
      surfaceSpeed: 7,
      gain: 100,
      maximum: 0.25,
    })).toBe(0.25);
  });
});
