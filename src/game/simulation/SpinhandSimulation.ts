import RAPIER from "@dimforge/rapier2d-compat";
import {
  FIXED_DT,
  WHEEL_FILTER_TIME,
  WHEEL_RADIUS,
  WHEEL_RIM_WIDTH,
  WHEEL_TOKEN_CAPACITY,
  WHEEL_TOKEN_REFILL,
  WHEEL_TOTAL_IMPULSE,
} from "../config";
import type { ControlSample } from "../input/InputController";
import {
  add,
  clamp,
  clockwiseTangent,
  cross,
  distance,
  lerp,
  scale,
  sub,
  type Vec2,
} from "../math/vec2";
import { calculateTangentialImpulse } from "./contactMath";
import { FrameImpulseBudget } from "./FrameImpulseBudget";
import { sampleShape, sweepWheelAgainstShape, type ContactShape, type SweepHit } from "./sweep";
import type {
  BodyRenderState,
  ContactFeedback,
  PlatformState,
  SimulationRenderState,
  TargetId,
} from "./types";

interface DynamicTarget {
  id: "ball" | "box";
  body: RAPIER.RigidBody;
  shape: ContactShape;
}

interface CandidateContact {
  targetId: TargetId;
  hit: SweepHit;
  body?: RAPIER.RigidBody;
}

interface ImpulseBudget {
  tokens: number;
}

const BALL_START = { x: -2.25, y: 2.05 };
const BOX_START = { x: 2.25, y: 2.12 };
const GEAR_POSITION = { x: 0, y: -3.15 };

export const SANDBOX_PLATFORMS: readonly PlatformState[] = [
  { position: { x: 0, y: -7.45 }, halfExtents: { x: 4.45, y: 0.35 }, rotation: 0 },
  { position: { x: -4.35, y: 0 }, halfExtents: { x: 0.22, y: 7.2 }, rotation: 0 },
  { position: { x: 4.35, y: 0 }, halfExtents: { x: 0.22, y: 7.2 }, rotation: 0 },
  { position: { x: -2.45, y: 1.28 }, halfExtents: { x: 1.72, y: 0.16 }, rotation: 0, surface: "guide", blocksWheel: false },
  { position: { x: 2.45, y: 1.28 }, halfExtents: { x: 1.72, y: 0.16 }, rotation: 0, surface: "guide", blocksWheel: false },
];

export class SpinhandSimulation {
  readonly world: RAPIER.World;
  private readonly ballBody: RAPIER.RigidBody;
  private readonly boxBody: RAPIER.RigidBody;
  private readonly dynamicTargets: DynamicTarget[];
  private readonly budgets = new Map<TargetId, ImpulseBudget>();
  private contacts: ContactFeedback[] = [];
  private wheelPosition: Vec2 = { x: 0, y: 5.1 };
  private previousWheelPosition: Vec2 = { ...this.wheelPosition };
  private wheelActive = false;
  private hadContact = false;
  private gearRotation = 0;
  private gearAngularVelocity = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -12.5 });
    this.world.timestep = FIXED_DT;

    for (const platform of SANDBOX_PLATFORMS) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(platform.position.x, platform.position.y)
          .setRotation(platform.rotation),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(platform.halfExtents.x, platform.halfExtents.y)
          .setFriction(0.82)
          .setRestitution(0.08),
        body,
      );
    }

    const gearBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(GEAR_POSITION.x, GEAR_POSITION.y),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.93).setFriction(0.72).setRestitution(0.18),
      gearBody,
    );

    this.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(BALL_START.x, BALL_START.y)
        .setLinearDamping(0.22)
        .setAngularDamping(0.12)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.56)
        .setDensity(1.05)
        .setFriction(0.68)
        .setRestitution(0.42),
      this.ballBody,
    );

    this.boxBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(BOX_START.x, BOX_START.y)
        .setLinearDamping(0.38)
        .setAngularDamping(2.1)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.64, 0.64)
        .setDensity(1.2)
        .setFriction(0.45)
        .setRestitution(0.08),
      this.boxBody,
    );

    this.dynamicTargets = [
      { id: "ball", body: this.ballBody, shape: { kind: "circle", radius: 0.56 } },
      { id: "box", body: this.boxBody, shape: { kind: "box", halfExtents: { x: 0.64, y: 0.64 } } },
    ];
    this.resetBudgets();
  }

  step(control: ControlSample, dt = FIXED_DT): void {
    this.contacts = [];
    this.previousWheelPosition = { ...this.wheelPosition };

    if (!control.active) {
      this.wheelActive = false;
      this.stepWorld(dt);
      this.updateGear(dt);
      this.hadContact = false;
      return;
    }

    if (control.justPressed || !this.wheelActive) {
      this.wheelActive = true;
      this.wheelPosition = this.resolveWheelPlacement(control.target);
      this.previousWheelPosition = { ...this.wheelPosition };
      this.stepWorld(dt);
      this.updateGear(dt);
      this.hadContact = false;
      return;
    }

    this.wheelActive = true;
    const follow = 1 - Math.exp(-dt / WHEEL_FILTER_TIME);
    const filteredTarget = lerp(this.wheelPosition, control.target, follow);
    const shouldSubstep = this.hadContact || distance(this.wheelPosition, filteredTarget) > 0.42;
    const substepCount = shouldSubstep ? 2 : 1;
    const substepDt = dt / substepCount;
    const frameBudget = new FrameImpulseBudget(WHEEL_TOTAL_IMPULSE);
    let current = { ...this.wheelPosition };
    this.refillBudgets(dt);

    for (let index = 0; index < substepCount; index += 1) {
      const remaining = substepCount - index;
      const intended = lerp(current, filteredTarget, 1 / remaining);
      const next = this.constrainWheelSweep(current, intended);
      this.applyWheelSweep(current, next, substepDt, frameBudget);
      this.stepWorld(substepDt);
      this.updateGear(substepDt);
      current = next;
    }

    this.wheelPosition = current;
    this.hadContact = this.contacts.some((contact) => !contact.invalidDeep);
  }

  reset(): void {
    this.resetBody(this.ballBody, BALL_START);
    this.resetBody(this.boxBody, BOX_START);
    this.wheelPosition = { x: 0, y: 5.1 };
    this.previousWheelPosition = { ...this.wheelPosition };
    this.wheelActive = false;
    this.hadContact = false;
    this.gearRotation = 0;
    this.gearAngularVelocity = 0;
    this.contacts = [];
    this.resetBudgets();
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  getRenderState(): SimulationRenderState {
    return {
      wheel: {
        position: { ...this.wheelPosition },
        previousPosition: { ...this.previousWheelPosition },
        active: this.wheelActive,
      },
      ball: this.readBody(this.ballBody),
      box: this.readBody(this.boxBody),
      gear: {
        position: { ...GEAR_POSITION },
        rotation: this.gearRotation,
        angularVelocity: this.gearAngularVelocity,
      },
      contacts: this.contacts,
      platforms: SANDBOX_PLATFORMS,
    };
  }

  getSignature(): readonly number[] {
    const ball = this.readBody(this.ballBody);
    const box = this.readBody(this.boxBody);
    return [
      ball.position.x,
      ball.position.y,
      ball.rotation,
      ball.linearVelocity.x,
      ball.linearVelocity.y,
      ball.angularVelocity,
      box.position.x,
      box.position.y,
      box.rotation,
      box.linearVelocity.x,
      box.linearVelocity.y,
      box.angularVelocity,
      this.gearRotation,
      this.gearAngularVelocity,
    ];
  }

  private applyWheelSweep(start: Vec2, end: Vec2, dt: number, frameBudget: FrameImpulseBudget): void {
    const candidates: CandidateContact[] = this.dynamicTargets.flatMap((target) => {
      const translation = target.body.translation();
      const hit = sweepWheelAgainstShape(
        start,
        end,
        WHEEL_RADIUS,
        WHEEL_RIM_WIDTH,
        target.shape,
        { position: { x: translation.x, y: translation.y }, rotation: target.body.rotation() },
      );
      return hit ? [{ targetId: target.id, hit, body: target.body }] : [];
    });

    const gearHit = sweepWheelAgainstShape(
      start,
      end,
      WHEEL_RADIUS,
      WHEEL_RIM_WIDTH,
      { kind: "circle", radius: 1.13 },
      { position: GEAR_POSITION, rotation: this.gearRotation },
    );
    if (gearHit) candidates.push({ targetId: "gear", hit: gearHit });
    candidates.sort((a, b) => a.hit.time - b.hit.time);

    for (const candidate of candidates) {
      const radial = sub(candidate.hit.point, candidate.hit.wheelCenter);
      const tangent = clockwiseTangent(radial);
      const feedback: ContactFeedback = {
        targetId: candidate.targetId,
        point: candidate.hit.point,
        normal: candidate.hit.normal,
        tangent,
        impulse: 0,
        invalidDeep: candidate.hit.invalidDeep,
      };

      if (candidate.hit.invalidDeep || frameBudget.available <= 0) {
        this.contacts.push(feedback);
        continue;
      }

      const contactVelocity = candidate.body
        ? this.bodyVelocityAtPoint(candidate.body, candidate.hit.point)
        : this.gearVelocityAtPoint(candidate.hit.point);
      const effectiveMass = candidate.body ? Math.max(0.35, candidate.body.mass()) : 1.7;
      const requested = calculateTangentialImpulse({ tangent, contactVelocity, effectiveMass, dt });
      const budget = this.budgets.get(candidate.targetId);
      if (!budget) continue;
      const impulse = frameBudget.take(Math.min(requested, budget.tokens));
      budget.tokens -= impulse;
      feedback.impulse = impulse;

      if (impulse > 0) {
        const impulseVector = scale(tangent, impulse);
        if (candidate.body) {
          candidate.body.applyImpulseAtPoint(impulseVector, candidate.hit.point, true);
        } else {
          const gearRadius = sub(candidate.hit.point, GEAR_POSITION);
          const torqueImpulse = cross(gearRadius, impulseVector);
          this.gearAngularVelocity = clamp(this.gearAngularVelocity + torqueImpulse / 1.65, -5.8, 5.8);
        }
      }
      this.contacts.push(feedback);
    }
  }

  private bodyVelocityAtPoint(body: RAPIER.RigidBody, point: Vec2): Vec2 {
    const linear = body.linvel();
    const position = body.translation();
    const relative = { x: point.x - position.x, y: point.y - position.y };
    const angular = body.angvel();
    return {
      x: linear.x - angular * relative.y,
      y: linear.y + angular * relative.x,
    };
  }

  private gearVelocityAtPoint(point: Vec2): Vec2 {
    const relative = sub(point, GEAR_POSITION);
    return {
      x: -this.gearAngularVelocity * relative.y,
      y: this.gearAngularVelocity * relative.x,
    };
  }

  private updateGear(dt: number): void {
    this.gearRotation += this.gearAngularVelocity * dt;
    this.gearAngularVelocity *= Math.exp(-1.18 * dt);
  }

  private stepWorld(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  private readBody(body: RAPIER.RigidBody): BodyRenderState {
    const position = body.translation();
    const velocity = body.linvel();
    return {
      position: { x: position.x, y: position.y },
      rotation: body.rotation(),
      linearVelocity: { x: velocity.x, y: velocity.y },
      angularVelocity: body.angvel(),
    };
  }

  private resetBody(body: RAPIER.RigidBody, position: Vec2): void {
    body.setTranslation(position, true);
    body.setRotation(0, true);
    body.setLinvel({ x: 0, y: 0 }, true);
    body.setAngvel(0, true);
    body.resetForces(true);
    body.resetTorques(true);
  }

  private resetBudgets(): void {
    for (const id of ["ball", "box", "gear"] as const) {
      this.budgets.set(id, { tokens: WHEEL_TOKEN_CAPACITY });
    }
  }

  private refillBudgets(dt: number): void {
    for (const budget of this.budgets.values()) {
      budget.tokens = Math.min(WHEEL_TOKEN_CAPACITY, budget.tokens + WHEEL_TOKEN_REFILL * dt);
    }
  }

  private resolveWheelPlacement(target: Vec2): Vec2 {
    let resolved = { ...target };
    for (let pass = 0; pass < 3; pass += 1) {
      for (const platform of SANDBOX_PLATFORMS) {
        if (platform.blocksWheel === false) continue;
        const sample = sampleShape(
          resolved,
          { kind: "box", halfExtents: platform.halfExtents },
          { position: platform.position, rotation: platform.rotation },
        );
        const clearance = WHEEL_RADIUS + 0.015;
        if (sample.signedDistance < clearance) {
          resolved = add(resolved, scale(sample.normal, clearance - sample.signedDistance));
        }
      }
    }
    return resolved;
  }

  private constrainWheelSweep(start: Vec2, end: Vec2): Vec2 {
    const sweepDistance = distance(start, end);
    if (sweepDistance < 1e-6) return { ...end };
    let earliest = 1;
    for (const platform of SANDBOX_PLATFORMS) {
      if (platform.blocksWheel === false) continue;
      const shape = { kind: "box", halfExtents: platform.halfExtents } as const;
      const transform = { position: platform.position, rotation: platform.rotation };
      const startDistance = sampleShape(start, shape, transform).signedDistance;
      const endDistance = sampleShape(end, shape, transform).signedDistance;
      if (startDistance <= WHEEL_RADIUS + 0.015) {
        if (endDistance < startDistance - 1e-4) earliest = 0;
        continue;
      }
      const hit = sweepWheelAgainstShape(start, end, WHEEL_RADIUS, 0, shape, transform);
      if (hit) earliest = Math.min(earliest, hit.time);
    }
    if (earliest >= 1) return { ...end };
    return lerp(start, end, Math.max(0, earliest - 0.02 / sweepDistance));
  }
}
