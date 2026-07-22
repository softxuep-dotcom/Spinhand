import { describe, expect, it } from "vitest";
import { sweepWheelAgainstShape } from "../src/game/simulation/sweep";

describe("wheel sweep", () => {
  it("finds a circle crossed between fixed frames", () => {
    const hit = sweepWheelAgainstShape(
      { x: -4, y: 0 },
      { x: 4, y: 0 },
      0.72,
      0.22,
      { kind: "circle", radius: 0.56 },
      { position: { x: 0, y: 0 }, rotation: 0 },
    );
    expect(hit).not.toBeNull();
    expect(hit?.time).toBeGreaterThan(0.2);
    expect(hit?.time).toBeLessThan(0.5);
    expect(hit?.invalidDeep).toBe(false);
  });

  it("finds a rotated box edge", () => {
    const hit = sweepWheelAgainstShape(
      { x: -3, y: 1 },
      { x: 3, y: 1 },
      0.72,
      0.22,
      { kind: "box", halfExtents: { x: 0.64, y: 0.64 } },
      { position: { x: 0, y: 0 }, rotation: Math.PI / 4 },
    );
    expect(hit).not.toBeNull();
    expect(hit?.invalidDeep).toBe(false);
  });

  it("marks a stationary wheel center inside a body as invalid deep contact", () => {
    const hit = sweepWheelAgainstShape(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      0.72,
      0.22,
      { kind: "circle", radius: 0.56 },
      { position: { x: 0, y: 0 }, rotation: 0 },
    );
    expect(hit?.invalidDeep).toBe(true);
  });

  it("does not miss any of 10,000 seeded high-speed crossings", () => {
    let seed = 0x5eeda11;
    const random = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x1_0000_0000;
    };
    let hits = 0;

    for (let index = 0; index < 10_000; index += 1) {
      const angle = random() * Math.PI * 2;
      const offset = (random() * 2 - 1) * 1.18;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      const perpendicular = { x: -direction.y, y: direction.x };
      const start = {
        x: -direction.x * 4 + perpendicular.x * offset,
        y: -direction.y * 4 + perpendicular.y * offset,
      };
      const end = {
        x: direction.x * 4 + perpendicular.x * offset,
        y: direction.y * 4 + perpendicular.y * offset,
      };
      const hit = sweepWheelAgainstShape(
        start,
        end,
        0.72,
        0.22,
        { kind: "circle", radius: 0.56 },
        { position: { x: 0, y: 0 }, rotation: 0 },
      );
      if (hit && !hit.invalidDeep) hits += 1;
    }

    expect(hits).toBe(10_000);
  });
});
