import RAPIER from "@dimforge/rapier2d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { CampaignSimulation } from "../src/game/campaign/CampaignSimulation";
import { getCampaignLevel } from "../src/game/campaign/levels";
import { FIXED_DT } from "../src/game/config";

const idle = (simulation: CampaignSimulation, frames = 45): void => {
  for (let index = 0; index < frames; index += 1) {
    simulation.step({ active: false, justPressed: false, target: { x: 0, y: 5 } }, FIXED_DT);
  }
};

const drag = (
  simulation: CampaignSimulation,
  start: { x: number; y: number },
  end: { x: number; y: number },
  frames = 70,
): void => {
  simulation.step({ active: true, justPressed: true, target: start }, FIXED_DT);
  for (let index = 1; index <= frames; index += 1) {
    const amount = index / frames;
    simulation.step({
      active: true,
      justPressed: false,
      target: {
        x: start.x + (end.x - start.x) * amount,
        y: start.y + (end.y - start.y) * amount,
      },
    }, FIXED_DT);
  }
  simulation.step({ active: false, justPressed: false, target: end }, FIXED_DT);
};

beforeAll(async () => RAPIER.init());

describe("chapter one campaign", () => {
  it("parks the idle wheel on the rim each level teaches", () => {
    const first = new CampaignSimulation(getCampaignLevel(1)).getRenderState();
    expect(first.wheel.position.y).toBeLessThan(first.object!.position.y);

    const second = new CampaignSimulation(getCampaignLevel(2)).getRenderState();
    expect(second.wheel.position.y).toBeGreaterThan(second.object!.position.y);

    const lift = new CampaignSimulation(getCampaignLevel(3)).getRenderState();
    expect(lift.wheel.position.x).toBeGreaterThan(lift.mechanism!.position.x);

    const press = new CampaignSimulation(getCampaignLevel(4)).getRenderState();
    expect(press.wheel.position.x).toBeLessThan(press.mechanism!.position.x);
  });

  it("level 1 sends the ball toward the right cup", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(1));
    idle(simulation);
    const before = simulation.getRenderState().object!;
    drag(
      simulation,
      { x: before.position.x - 0.75, y: before.position.y - 1.28 },
      { x: before.position.x + 1.65, y: before.position.y - 1.28 },
      48,
    );
    idle(simulation, 100);
    const after = simulation.getRenderState().object!;
    expect(after.position.x).toBeGreaterThan(before.position.x + 0.5);
    expect(simulation.getRenderState().completed).toBe(true);
  });

  it("level 2 sends the crate left from above", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(2));
    idle(simulation);
    const before = simulation.getRenderState().object!;
    drag(simulation, { x: 3, y: before.position.y + 1.36 }, { x: -1.8, y: before.position.y + 1.36 });
    idle(simulation, 90);
    const after = simulation.getRenderState().object!;
    expect(after.position.x).toBeLessThan(before.position.x - 0.5);
    expect(simulation.getRenderState().completed).toBe(true);
  });

  it("levels 3 and 4 project tangential force onto opposite slider directions", () => {
    const lift = new CampaignSimulation(getCampaignLevel(3));
    const liftBefore = lift.getRenderState().mechanism!.position.y;
    lift.step({ active: true, justPressed: true, target: { x: 1.55, y: liftBefore } }, FIXED_DT);
    for (let index = 0; index < 360 && !lift.getRenderState().completed; index += 1) {
      const mechanism = lift.getRenderState().mechanism!;
      lift.step({ active: true, justPressed: false, target: { x: 1.55, y: mechanism.position.y } }, FIXED_DT);
    }
    expect(lift.getRenderState().mechanism!.position.y).toBeGreaterThan(liftBefore + 0.25);
    expect(lift.getRenderState().completed).toBe(true);

    const press = new CampaignSimulation(getCampaignLevel(4));
    const pressBefore = press.getRenderState().mechanism!.position.y;
    press.step({ active: true, justPressed: true, target: { x: -1.02, y: pressBefore } }, FIXED_DT);
    for (let index = 0; index < 360 && !press.getRenderState().completed; index += 1) {
      const mechanism = press.getRenderState().mechanism!;
      press.step({ active: true, justPressed: false, target: { x: -1.02, y: mechanism.position.y } }, FIXED_DT);
    }
    expect(press.getRenderState().mechanism!.position.y).toBeLessThan(pressBefore - 0.25);
    expect(press.getRenderState().completed).toBe(true);
  });

  it("level 5 requires a rightward run before the return sweep", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(5));
    idle(simulation, 50);
    let object = simulation.getRenderState().object!;
    simulation.step({ active: true, justPressed: true, target: { x: object.position.x - 0.15, y: object.position.y - 1.28 } }, FIXED_DT);
    for (let index = 0; index < 420 && simulation.getRenderState().phase === 0; index += 1) {
      object = simulation.getRenderState().object!;
      simulation.step({ active: true, justPressed: false, target: { x: object.position.x - 0.12, y: object.position.y - 1.28 } }, FIXED_DT);
    }
    expect(simulation.getRenderState().phase).toBe(1);

    object = simulation.getRenderState().object!;
    simulation.step({ active: true, justPressed: true, target: { x: object.position.x + 0.12, y: object.position.y + 1.28 } }, FIXED_DT);
    for (let index = 0; index < 520 && !simulation.getRenderState().completed; index += 1) {
      object = simulation.getRenderState().object!;
      simulation.step({ active: true, justPressed: false, target: { x: object.position.x + 0.12, y: object.position.y + 1.28 } }, FIXED_DT);
    }
    expect(simulation.getRenderState().completed).toBe(true);
  });
});
