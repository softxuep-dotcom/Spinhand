import RAPIER from "@dimforge/rapier2d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { FIXED_DT } from "../src/game/config";
import type { ControlSample } from "../src/game/input/InputController";
import { SpinhandSimulation } from "../src/game/simulation/SpinhandSimulation";

const idle = (simulation: SpinhandSimulation, frames = 90): void => {
  for (let frame = 0; frame < frames; frame += 1) {
    simulation.step({ active: false, target: { x: 0, y: 5 }, justPressed: false }, FIXED_DT);
  }
};

const drag = (
  simulation: SpinhandSimulation,
  start: { x: number; y: number },
  end: { x: number; y: number },
  frames = 50,
): { contacts: number; impulse: number } => {
  let contacts = 0;
  let impulse = 0;
  simulation.step({ active: true, target: start, justPressed: true }, FIXED_DT);
  for (let frame = 1; frame <= frames; frame += 1) {
    const amount = frame / frames;
    const control: ControlSample = {
      active: true,
      target: {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      },
      justPressed: false,
    };
    simulation.step(control, FIXED_DT);
    const feedback = simulation.getRenderState().contacts;
    contacts += feedback.length;
    impulse += feedback.reduce((sum, item) => sum + item.impulse, 0);
  }
  simulation.step({ active: false, target: end, justPressed: false }, FIXED_DT);
  return { contacts, impulse };
};

beforeAll(async () => {
  await RAPIER.init();
});

describe("P0 sandbox responses", () => {
  it("moves and spins the ball right when the upper rim contacts its underside", () => {
    const simulation = new SpinhandSimulation();
    idle(simulation);
    const before = simulation.getRenderState().ball;
    const wheelY = before.position.y - 0.56 - 0.72;
    drag(simulation, { x: before.position.x - 0.3, y: wheelY }, { x: before.position.x + 1.1, y: wheelY });
    const after = simulation.getRenderState().ball;
    expect(after.position.x).toBeGreaterThan(before.position.x + 0.08);
    expect(after.angularVelocity).toBeGreaterThan(0.15);
  });

  it("moves the box left when the lower rim contacts its top", () => {
    const simulation = new SpinhandSimulation();
    idle(simulation);
    const before = simulation.getRenderState().box;
    const wheelY = before.position.y + 0.64 + 0.72;
    const metrics = drag(simulation, { x: before.position.x + 0.3, y: wheelY }, { x: before.position.x - 1.2, y: wheelY });
    const after = simulation.getRenderState().box;
    expect(metrics.contacts).toBeGreaterThan(0);
    expect(metrics.impulse).toBeGreaterThan(0.1);
    expect(after.position.x).toBeLessThan(before.position.x - 0.08);
  });

  it("spins the fixed gear when its right edge meets the wheel's left rim", () => {
    const simulation = new SpinhandSimulation();
    idle(simulation);
    drag(simulation, { x: 1.85, y: -3.55 }, { x: 1.85, y: -2.75 }, 70);
    const gear = simulation.getRenderState().gear;
    expect(Math.abs(gear.rotation)).toBeGreaterThan(0.05);
    expect(Math.abs(gear.angularVelocity)).toBeGreaterThan(0.05);
  });

  it("reproduces one recorded input with the same functional result 100 times", () => {
    const simulation = new SpinhandSimulation();
    const samples: ControlSample[] = [];
    for (let frame = 0; frame < 80; frame += 1) {
      samples.push({ active: false, target: { x: 0, y: 5 }, justPressed: false });
    }
    samples.push({ active: true, target: { x: -2.55, y: 0.77 }, justPressed: true });
    for (let frame = 1; frame <= 50; frame += 1) {
      samples.push({
        active: true,
        target: { x: -2.55 + frame * 0.03, y: 0.77 },
        justPressed: false,
      });
    }
    samples.push({ active: false, target: { x: -1.05, y: 0.77 }, justPressed: false });

    let reference: readonly number[] | null = null;
    let matchingRuns = 0;
    for (let run = 0; run < 100; run += 1) {
      simulation.reset();
      for (const sample of samples) simulation.step(sample, FIXED_DT);
      const signature = simulation.getSignature();
      reference ??= signature;
      if (signature.every((value, index) => Math.abs(value - (reference?.[index] ?? Number.NaN)) < 1e-7)) {
        matchingRuns += 1;
      }
    }
    expect(matchingRuns).toBe(100);
  });
});
