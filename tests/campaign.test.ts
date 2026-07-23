import RAPIER from "@dimforge/rapier2d-compat";
import { beforeAll, describe, expect, it } from "vitest";
import { CampaignSimulation } from "../src/game/campaign/CampaignSimulation";
import {
  CAMPAIGN_CHAPTERS,
  CAMPAIGN_LEVELS,
  TOTAL_LEVELS,
  getCampaignLevel,
  type CampaignLevel,
} from "../src/game/campaign/levels";
import { CAMPAIGN_WHEEL_TOTAL_IMPULSE, FIXED_DT, WHEEL_RADIUS } from "../src/game/config";

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

const makeBallLevel = (platforms: CampaignLevel["platforms"] = []): CampaignLevel => ({
  id: 99,
  chapter: 1,
  name: "test",
  verb: "test",
  hint: "test",
  accent: 0xffffff,
  object: { kind: "ball", start: { x: 0, y: 0 }, radius: 0.56, density: 1 },
  goal: { kind: "cup", position: { x: 3.5, y: 3.5 }, halfExtents: { x: 0.4, y: 0.4 } },
  bolt: { x: 4, y: 4 },
  platforms,
});

describe("chapter one campaign", () => {
  it("parks the idle wheel on the rim each level teaches", () => {
    const first = new CampaignSimulation(getCampaignLevel(1)).getRenderState();
    expect(first.wheel.position.y).toBeLessThan(first.mechanism!.position.y);

    const second = new CampaignSimulation(getCampaignLevel(2)).getRenderState();
    expect(second.wheel.position.y).toBeGreaterThan(second.object!.position.y);

    const lift = new CampaignSimulation(getCampaignLevel(3)).getRenderState();
    expect(lift.wheel.position.x).toBeGreaterThan(lift.mechanism!.position.x);

    const press = new CampaignSimulation(getCampaignLevel(4)).getRenderState();
    expect(press.wheel.position.x).toBeLessThan(press.mechanism!.position.x);
  });

  it("level 1 drives a constrained rack right without a free body to launch", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(1));
    const before = simulation.getRenderState().mechanism!;
    simulation.step({
      active: true,
      justPressed: true,
      target: { x: before.position.x, y: before.position.y - before.halfExtents.y - WHEEL_RADIUS },
    }, FIXED_DT);
    for (let index = 0; index < 420 && !simulation.getRenderState().completed; index += 1) {
      const rack = simulation.getRenderState().mechanism!;
      simulation.step({
        active: true,
        justPressed: false,
        target: { x: rack.position.x, y: rack.position.y - rack.halfExtents.y - WHEEL_RADIUS },
      }, FIXED_DT);
    }
    expect(simulation.getRenderState().mechanism!.position.x).toBeGreaterThan(before.position.x + 2.5);
    expect(simulation.getRenderState().completed).toBe(true);
  });

  it("level 1 rejects the blocked side instead of faking the intended direction", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(1));
    const before = simulation.getRenderState().mechanism!;
    const blockedTarget = {
      x: before.position.x,
      y: before.position.y + before.halfExtents.y + WHEEL_RADIUS,
    };
    simulation.step({ active: true, justPressed: true, target: blockedTarget }, FIXED_DT);
    for (let index = 0; index < 90; index += 1) {
      simulation.step({ active: true, justPressed: false, target: blockedTarget }, FIXED_DT);
    }
    expect(simulation.getRenderState().mechanism!.position.x).toBeLessThanOrEqual(before.position.x + 0.02);
    expect(simulation.getRenderState().completed).toBe(false);
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

  it.each([
    ["below", { x: 0, y: -1.28 }, { x: 1, y: 0 }],
    ["right", { x: 1.28, y: 0 }, { x: 0, y: 1 }],
    ["above", { x: 0, y: 1.28 }, { x: -1, y: 0 }],
    ["left", { x: -1.28, y: 0 }, { x: 0, y: -1 }],
  ] as const)("uses the real tangent from the %s contact quadrant", (_side, offset, expected) => {
    const simulation = new CampaignSimulation(makeBallLevel());
    const ball = simulation.getRenderState().object!;
    const target = { x: ball.position.x + offset.x, y: ball.position.y + offset.y };
    simulation.step({ active: true, justPressed: true, target }, FIXED_DT);
    simulation.step({ active: true, justPressed: false, target }, FIXED_DT);
    const contact = simulation.getRenderState().contacts.find((item) => item.impulse > 0);
    expect(contact).toBeDefined();
    expect(contact!.tangent.x).toBeCloseTo(expected.x, 1);
    expect(contact!.tangent.y).toBeCloseTo(expected.y, 1);
  });

  it("keeps the wrong side from advancing levels 2 through 4", () => {
    const crate = new CampaignSimulation(getCampaignLevel(2));
    idle(crate);
    const crateBefore = crate.getRenderState().object!;
    const belowCrate = {
      x: crateBefore.position.x,
      y: crateBefore.position.y - 0.64 - WHEEL_RADIUS,
    };
    crate.step({ active: true, justPressed: true, target: belowCrate }, FIXED_DT);
    for (let index = 0; index < 90; index += 1) {
      crate.step({ active: true, justPressed: false, target: belowCrate }, FIXED_DT);
    }
    expect(crate.getRenderState().object!.position.x).toBeGreaterThan(crateBefore.position.x - 0.08);
    expect(crate.getRenderState().completed).toBe(false);

    const lift = new CampaignSimulation(getCampaignLevel(3));
    const liftBefore = lift.getRenderState().mechanism!;
    const leftOfLift = {
      x: liftBefore.position.x - liftBefore.halfExtents.x - WHEEL_RADIUS,
      y: liftBefore.position.y,
    };
    lift.step({ active: true, justPressed: true, target: leftOfLift }, FIXED_DT);
    for (let index = 0; index < 90; index += 1) {
      lift.step({ active: true, justPressed: false, target: leftOfLift }, FIXED_DT);
    }
    expect(lift.getRenderState().mechanism!.position.y).toBeLessThanOrEqual(liftBefore.position.y + 0.02);
    expect(lift.getRenderState().completed).toBe(false);

    const press = new CampaignSimulation(getCampaignLevel(4));
    const pressBefore = press.getRenderState().mechanism!;
    const rightOfPress = {
      x: pressBefore.position.x + pressBefore.halfExtents.x + WHEEL_RADIUS,
      y: pressBefore.position.y,
    };
    press.step({ active: true, justPressed: true, target: rightOfPress }, FIXED_DT);
    for (let index = 0; index < 90; index += 1) {
      press.step({ active: true, justPressed: false, target: rightOfPress }, FIXED_DT);
    }
    expect(press.getRenderState().mechanism!.position.y).toBeGreaterThanOrEqual(pressBefore.position.y - 0.02);
    expect(press.getRenderState().completed).toBe(false);
  });

  it("blocks the wheel at a solid wall before it can affect a target behind it", () => {
    const level: CampaignLevel = {
      ...makeBallLevel([{ position: { x: 0, y: 0 }, halfExtents: { x: 0.18, y: 3 }, rotation: 0 }]),
      object: { kind: "ball", start: { x: 1.45, y: 0 }, radius: 0.56, density: 1 },
    };
    const simulation = new CampaignSimulation(level);
    const before = simulation.getRenderState().object!;
    simulation.step({ active: true, justPressed: true, target: { x: -1.35, y: 0 } }, FIXED_DT);
    simulation.step({ active: true, justPressed: false, target: { x: 1.35, y: 0 } }, FIXED_DT);
    const state = simulation.getRenderState();
    expect(state.wheel.position.x).toBeLessThan(-0.85);
    expect(state.contacts.reduce((sum, contact) => sum + contact.impulse, 0)).toBe(0);
    expect(state.object!.position.x).toBeCloseTo(before.position.x, 1);
  });

  it("shares one impulse budget across all substeps in a fixed frame", () => {
    const simulation = new CampaignSimulation(makeBallLevel());
    simulation.step({ active: true, justPressed: true, target: { x: -0.35, y: -1.28 } }, FIXED_DT);
    simulation.step({ active: true, justPressed: false, target: { x: 1.05, y: -1.28 } }, FIXED_DT);
    const contacts = simulation.getRenderState().contacts;
    const totalImpulse = contacts.reduce((sum, contact) => sum + contact.impulse, 0);
    expect(contacts.filter((contact) => contact.impulse > 0)).toHaveLength(2);
    expect(totalImpulse).toBeGreaterThan(0.52);
    expect(totalImpulse).toBeLessThanOrEqual(CAMPAIGN_WHEEL_TOTAL_IMPULSE + 1e-7);
  });

  it("level 5 requires a rightward run before the return sweep", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(5));
    idle(simulation, 50);
    let object = simulation.getRenderState().object!;
    let phaseOneImpulse = 0;
    let contactFrames = 0;
    let highestPhaseOneY = object.position.y;
    let farthestPhaseOneX = object.position.x;
    simulation.step({ active: true, justPressed: true, target: { x: object.position.x - 0.15, y: object.position.y - 1.28 } }, FIXED_DT);
    for (let index = 0; index < 620 && simulation.getRenderState().phase === 0; index += 1) {
      object = simulation.getRenderState().object!;
      const climbing = object.position.x > -2.2;
      simulation.step({
        active: true,
        justPressed: false,
        target: climbing
          ? { x: object.position.x + 0.42, y: object.position.y - 1.12 }
          : { x: object.position.x - 0.12, y: object.position.y - 1.28 },
      }, FIXED_DT);
      const state = simulation.getRenderState();
      const frameImpulse = state.contacts.reduce((sum, contact) => sum + contact.impulse, 0);
      phaseOneImpulse += frameImpulse;
      contactFrames += Number(frameImpulse > 0);
      highestPhaseOneY = Math.max(highestPhaseOneY, state.object!.position.y);
      farthestPhaseOneX = Math.max(farthestPhaseOneX, state.object!.position.x);
    }
    const platformState = simulation.getRenderState();
    expect(
      platformState.phase,
      `ball stopped at ${platformState.object!.position.x.toFixed(2)}, ${platformState.object!.position.y.toFixed(2)}; max ${farthestPhaseOneX.toFixed(2)}, ${highestPhaseOneY.toFixed(2)}; impulse ${phaseOneImpulse.toFixed(2)} over ${contactFrames} frames`,
    ).toBe(1);
    expect(platformState.object!.position.y).toBeGreaterThan(-1.9);

    object = simulation.getRenderState().object!;
    simulation.step({ active: true, justPressed: true, target: { x: object.position.x + 0.18, y: object.position.y + 1.28 } }, FIXED_DT);
    for (let index = 0; index < 520 && !simulation.getRenderState().completed; index += 1) {
      object = simulation.getRenderState().object!;
      simulation.step({ active: true, justPressed: false, target: { x: object.position.x + 0.18, y: object.position.y + 1.28 } }, FIXED_DT);
    }
    expect(simulation.getRenderState().completed).toBe(true);
  });
});

describe("complete campaign", () => {
  it("ships six five-level chapters with unique ids and names", () => {
    expect(CAMPAIGN_CHAPTERS).toHaveLength(6);
    expect(CAMPAIGN_LEVELS).toHaveLength(TOTAL_LEVELS);
    expect(new Set(CAMPAIGN_LEVELS.map((level) => level.id)).size).toBe(TOTAL_LEVELS);
    expect(new Set(CAMPAIGN_LEVELS.map((level) => level.name)).size).toBe(TOTAL_LEVELS);
    for (const chapter of CAMPAIGN_CHAPTERS) {
      expect(CAMPAIGN_LEVELS.filter((level) => level.chapter === chapter.id)).toHaveLength(5);
    }
  });

  it("boots and advances every campaign level without invalid render state", () => {
    for (const level of CAMPAIGN_LEVELS) {
      const simulation = new CampaignSimulation(level);
      idle(simulation, 4);
      const state = simulation.getRenderState();
      expect(state.level.id).toBe(level.id);
      expect(Number.isFinite(state.wheel.position.x)).toBe(true);
      expect(Number.isFinite(state.wheel.position.y)).toBe(true);
      expect(Number.isFinite(state.goal.position.x)).toBe(true);
      expect(Number.isFinite(state.goal.position.y)).toBe(true);
    }
  });

  it("drives a constrained rotor to completion through rim contact", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(11));
    let mechanism = simulation.getRenderState().mechanism!;
    const target = {
      x: mechanism.position.x,
      y: mechanism.position.y - mechanism.radius - WHEEL_RADIUS,
    };
    simulation.step({ active: true, justPressed: true, target }, FIXED_DT);
    for (let index = 0; index < 720 && !simulation.getRenderState().completed; index += 1) {
      mechanism = simulation.getRenderState().mechanism!;
      simulation.step({ active: true, justPressed: false, target }, FIXED_DT);
    }
    const state = simulation.getRenderState();
    expect(state.mechanism!.rotation).toBeGreaterThan(0.5);
    expect(state.mechanism!.progress).toBe(1);
    expect(state.completed).toBe(true);
  });

  it("opens the second phase of a machine-then-object level", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(12));
    const mechanism = simulation.getRenderState().mechanism!;
    const target = {
      x: mechanism.position.x,
      y: mechanism.position.y - mechanism.radius - WHEEL_RADIUS,
    };
    simulation.step({ active: true, justPressed: true, target }, FIXED_DT);
    for (let index = 0; index < 720 && simulation.getRenderState().phase === 0; index += 1) {
      simulation.step({ active: true, justPressed: false, target }, FIXED_DT);
    }
    const state = simulation.getRenderState();
    expect(state.phase).toBe(1);
    expect(state.goal.active).toBe(true);
    expect(state.completed).toBe(false);
  });

  it("breaks glass after sustained stress while allowing a short tap", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(9));
    const object = simulation.getRenderState().object!;
    const target = { x: object.position.x, y: object.position.y + 0.5 + WHEEL_RADIUS };
    simulation.step({ active: true, justPressed: true, target }, FIXED_DT);
    simulation.step({ active: true, justPressed: false, target }, FIXED_DT);
    expect(simulation.getRenderState().failed).toBe(false);
    for (let index = 0; index < 60 && !simulation.getRenderState().failed; index += 1) {
      const glass = simulation.getRenderState().object!;
      simulation.step({
        active: true,
        justPressed: false,
        target: { x: glass.position.x, y: glass.position.y + 0.5 + WHEEL_RADIUS },
      }, FIXED_DT);
    }
    expect(simulation.getRenderState().failed).toBe(true);
  });

  it("moves the level 20 basket from simulation time, not render mutation", () => {
    const simulation = new CampaignSimulation(getCampaignLevel(20));
    const before = simulation.getRenderState().goal.position.x;
    idle(simulation, 24);
    const after = simulation.getRenderState().goal.position.x;
    expect(Math.abs(after - before)).toBeGreaterThan(0.3);
  });

  it("treats a dock as a floor contact target for the cart", () => {
    const source = getCampaignLevel(10);
    const level: CampaignLevel = {
      ...source,
      id: 100,
      object: { ...source.object!, start: { x: source.goal.position.x, y: -2 } },
    };
    const simulation = new CampaignSimulation(level);
    idle(simulation, 90);
    expect(simulation.getRenderState().completed).toBe(true);
  });
});
