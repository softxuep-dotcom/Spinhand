import RAPIER from "@dimforge/rapier2d-compat";
import {
  CAMPAIGN_WHEEL_TOTAL_IMPULSE,
  FIXED_DT,
  WHEEL_FILTER_TIME,
  WHEEL_RADIUS,
  WHEEL_RIM_WIDTH,
} from "../config";
import type { ControlSample } from "../input/InputController";
import { add, clamp, clockwiseTangent, distance, lerp, scale, sub, type Vec2 } from "../math/vec2";
import { calculateTangentialImpulse } from "../simulation/contactMath";
import { FrameImpulseBudget } from "../simulation/FrameImpulseBudget";
import { sampleShape, sweepWheelAgainstShape, type ContactShape } from "../simulation/sweep";
import type { BodyRenderState, ContactFeedback } from "../simulation/types";
import type { CampaignLevel } from "./levels";
import type { CampaignRenderState } from "./types";

const readBody = (body: RAPIER.RigidBody): BodyRenderState => {
  const position = body.translation();
  const velocity = body.linvel();
  return {
    position: { x: position.x, y: position.y },
    rotation: body.rotation(),
    linearVelocity: { x: velocity.x, y: velocity.y },
    angularVelocity: body.angvel(),
  };
};

export class CampaignSimulation {
  readonly world: RAPIER.World;
  private readonly objectBody?: RAPIER.RigidBody;
  private readonly objectShape?: ContactShape;
  private contacts: ContactFeedback[] = [];
  private wheelPosition: Vec2;
  private previousWheelPosition: Vec2;
  private wheelActive = false;
  private hadContact = false;
  private mechanismPosition = 0;
  private mechanismVelocity = 0;
  private goalHold = 0;
  private phase = 0;
  private hiddenBoltCollected = false;
  private completed = false;
  private failed = false;

  constructor(readonly level: CampaignLevel) {
    const object = level.object;
    const mechanism = level.mechanism;
    if (level.wheelStart) {
      this.wheelPosition = { ...level.wheelStart };
    } else if (object) {
      const extent = object.kind === "ball" ? object.radius ?? 0.56 : object.halfExtents?.y ?? 0.64;
      this.wheelPosition = {
        x: object.start.x - 0.18,
        y: object.start.y - extent - WHEEL_RADIUS,
      };
    } else if (mechanism) {
      if (mechanism.axis === "x") {
        this.wheelPosition = {
          x: mechanism.start.x,
          y: mechanism.start.y - mechanism.halfExtents.y - WHEEL_RADIUS,
        };
      } else {
        const toRight = mechanism.kind === "bolt";
        this.wheelPosition = {
          x: mechanism.start.x + (toRight ? 1 : -1) * (mechanism.halfExtents.x + WHEEL_RADIUS),
          y: mechanism.start.y,
        };
      }
    } else {
      this.wheelPosition = { x: 0, y: 5.2 };
    }
    this.previousWheelPosition = { ...this.wheelPosition };
    this.world = new RAPIER.World({ x: 0, y: -12.5 });
    this.world.timestep = FIXED_DT;

    for (const platform of level.platforms) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(platform.position.x, platform.position.y)
          .setRotation(platform.rotation),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(platform.halfExtents.x, platform.halfExtents.y)
          .setFriction(platform.friction ?? 0.82)
          .setRestitution(0.08),
        body,
      );
    }

    if (level.object) {
      this.objectBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(level.object.start.x, level.object.start.y)
          .setLinearDamping(level.object.linearDamping ?? (level.object.kind === "box" ? 0.55 : 0.2))
          .setAngularDamping(level.object.angularDamping ?? (level.object.kind === "box" ? 2.4 : 0.12))
          .setCcdEnabled(true),
      );
      if (level.object.kind === "ball") {
        const radius = level.object.radius ?? 0.56;
        this.objectShape = { kind: "circle", radius };
        this.world.createCollider(
          RAPIER.ColliderDesc.ball(radius)
            .setDensity(level.object.density ?? 1)
            .setFriction(level.object.friction ?? 0.68)
            .setRestitution(level.object.restitution ?? 0.36),
          this.objectBody,
        );
      } else {
        const halfExtents = level.object.halfExtents ?? { x: 0.64, y: 0.64 };
        this.objectShape = { kind: "box", halfExtents };
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y)
            .setDensity(level.object.density ?? 1.2)
            .setFriction(0.5)
            .setRestitution(0.06),
          this.objectBody,
        );
      }
    }
    this.mechanismPosition = level.mechanism
      ? level.mechanism.start[level.mechanism.axis]
      : 0;
  }

  step(control: ControlSample, dt = FIXED_DT): void {
    if (this.completed || this.failed) return;
    this.contacts = [];
    this.previousWheelPosition = { ...this.wheelPosition };

    if (!control.active) {
      this.wheelActive = false;
      this.stepWorld(dt);
      this.stepMechanism(dt);
      this.evaluateState(dt);
      this.hadContact = false;
      return;
    }

    if (control.justPressed || !this.wheelActive) {
      this.wheelActive = true;
      this.wheelPosition = this.resolveWheelPlacement(control.target);
      this.previousWheelPosition = { ...this.wheelPosition };
      this.collectHiddenBolt();
      this.stepWorld(dt);
      this.stepMechanism(dt);
      this.evaluateState(dt);
      return;
    }

    this.wheelActive = true;
    const follow = 1 - Math.exp(-dt / WHEEL_FILTER_TIME);
    const target = lerp(this.wheelPosition, control.target, follow);
    const substeps = this.hadContact || distance(this.wheelPosition, target) > 0.42 ? 2 : 1;
    const frameBudget = new FrameImpulseBudget(CAMPAIGN_WHEEL_TOTAL_IMPULSE);
    let current = { ...this.wheelPosition };
    for (let index = 0; index < substeps; index += 1) {
      const intended = lerp(current, target, 1 / (substeps - index));
      const next = this.constrainWheelSweep(current, intended);
      this.applySweep(current, next, dt / substeps, frameBudget);
      this.stepWorld(dt / substeps);
      this.stepMechanism(dt / substeps);
      current = next;
    }
    this.wheelPosition = current;
    this.collectHiddenBolt();
    this.hadContact = this.contacts.some((contact) => !contact.invalidDeep && contact.impulse > 0);
    this.evaluateState(dt);
  }

  getRenderState(): CampaignRenderState {
    const mechanism = this.level.mechanism;
    const mechanismRange = mechanism ? mechanism.maximum - mechanism.minimum : 1;
    const progress = mechanism
      ? clamp(
          mechanism.kind === "plunger"
            ? (mechanism.maximum - this.mechanismPosition) / mechanismRange
            : (this.mechanismPosition - mechanism.minimum) / mechanismRange,
          0,
          1,
        )
      : 0;
    return {
      level: this.level,
      wheel: {
        position: { ...this.wheelPosition },
        previousPosition: { ...this.previousWheelPosition },
        active: this.wheelActive,
      },
      object: this.objectBody && this.level.object
        ? { ...readBody(this.objectBody), kind: this.level.object.kind }
        : undefined,
      mechanism: mechanism
        ? {
            kind: mechanism.kind,
            axis: mechanism.axis,
            position: mechanism.axis === "x"
              ? { x: this.mechanismPosition, y: mechanism.start.y }
              : { x: mechanism.start.x, y: this.mechanismPosition },
            halfExtents: mechanism.halfExtents,
            progress,
          }
        : undefined,
      goal: {
        ...this.level.goal,
        progress: clamp(this.goalHold / this.goalHoldRequired, 0, 1),
      },
      contacts: this.contacts,
      platforms: this.level.platforms,
      hiddenBolt: { position: this.level.bolt, collected: this.hiddenBoltCollected },
      phase: this.phase,
      completed: this.completed,
      failed: this.failed,
    };
  }

  private applySweep(start: Vec2, end: Vec2, dt: number, frameBudget: FrameImpulseBudget): void {
    if (this.objectBody && this.objectShape && this.level.object) {
      const translation = this.objectBody.translation();
      const hit = sweepWheelAgainstShape(
        start,
        end,
        WHEEL_RADIUS,
        WHEEL_RIM_WIDTH,
        this.objectShape,
        { position: { x: translation.x, y: translation.y }, rotation: this.objectBody.rotation() },
      );
      if (hit) {
        const tangent = clockwiseTangent(sub(hit.point, hit.wheelCenter));
        const feedback: ContactFeedback = {
          targetId: this.level.object.kind,
          point: hit.point,
          normal: hit.normal,
          tangent,
          impulse: 0,
          invalidDeep: hit.invalidDeep,
        };
        if (!hit.invalidDeep) {
          const velocity = this.velocityAtPoint(this.objectBody, hit.point);
          const impulse = frameBudget.take(
            calculateTangentialImpulse({
              tangent,
              contactVelocity: velocity,
              effectiveMass: Math.max(0.35, this.objectBody.mass()),
              dt,
              surfaceSpeed: 9.1,
              gain: 12,
              maximum: 0.52,
            }),
          );
          if (impulse > 0) {
            this.objectBody.applyImpulseAtPoint(scale(tangent, impulse), hit.point, true);
            feedback.impulse = impulse;
          }
        }
        this.contacts.push(feedback);
      }
    }

    const mechanism = this.level.mechanism;
    if (mechanism && frameBudget.available > 0) {
      const mechanismPosition = mechanism.axis === "x"
        ? { x: this.mechanismPosition, y: mechanism.start.y }
        : { x: mechanism.start.x, y: this.mechanismPosition };
      const hit = sweepWheelAgainstShape(
        start,
        end,
        WHEEL_RADIUS,
        WHEEL_RIM_WIDTH,
        { kind: "box", halfExtents: mechanism.halfExtents },
        { position: mechanismPosition, rotation: 0 },
      );
      if (hit) {
        const tangent = clockwiseTangent(sub(hit.point, hit.wheelCenter));
        const feedback: ContactFeedback = {
          targetId: mechanism.kind,
          point: hit.point,
          normal: hit.normal,
          tangent,
          impulse: 0,
          invalidDeep: hit.invalidDeep,
        };
        if (!hit.invalidDeep) {
          const axisTangent = mechanism.axis === "x" ? tangent.x : tangent.y;
          const contactVelocity = mechanism.axis === "x"
            ? { x: this.mechanismVelocity, y: 0 }
            : { x: 0, y: this.mechanismVelocity };
          const impulse = frameBudget.take(
            calculateTangentialImpulse({
              tangent,
              contactVelocity,
              effectiveMass: 1.6,
              dt,
              surfaceSpeed: 8.6,
              gain: 11,
              maximum: 0.48,
            }),
          );
          this.mechanismVelocity += (axisTangent * impulse) / 1.6;
          feedback.impulse = impulse;
        }
        this.contacts.push(feedback);
      }
    }
  }

  private velocityAtPoint(body: RAPIER.RigidBody, point: Vec2): Vec2 {
    const linear = body.linvel();
    const position = body.translation();
    const relative = { x: point.x - position.x, y: point.y - position.y };
    return {
      x: linear.x - body.angvel() * relative.y,
      y: linear.y + body.angvel() * relative.x,
    };
  }

  private stepWorld(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
  }

  private stepMechanism(dt: number): void {
    const mechanism = this.level.mechanism;
    if (!mechanism) return;
    this.mechanismVelocity *= Math.exp(-2.8 * dt);
    this.mechanismPosition = clamp(
      this.mechanismPosition + this.mechanismVelocity * dt,
      mechanism.minimum,
      mechanism.maximum,
    );
    if (this.mechanismPosition === mechanism.minimum || this.mechanismPosition === mechanism.maximum) {
      this.mechanismVelocity = 0;
    }
  }

  private evaluateState(dt: number): void {
    let inGoal = false;
    if (this.level.mechanism) {
      inGoal = this.level.mechanism.kind === "plunger"
        ? this.mechanismPosition <= this.level.mechanism.target
        : this.mechanismPosition >= this.level.mechanism.target;
    } else if (this.objectBody) {
      const body = readBody(this.objectBody);
      if (this.level.phaseCheckpoint && this.phase === 0) {
        const checkpoint = this.level.phaseCheckpoint;
        if (
          Math.abs(body.position.x - checkpoint.position.x) <= checkpoint.halfExtents.x
          && Math.abs(body.position.y - checkpoint.position.y) <= checkpoint.halfExtents.y
        ) {
          this.phase = 1;
        }
      }
      const goal = this.level.goal;
      const verticalExtent = this.level.object?.kind === "box"
        ? this.level.object.halfExtents?.y ?? 0.64
        : this.level.object?.radius ?? 0.56;
      const inside = goal.kind === "plate"
        ? Math.abs(body.position.x - goal.position.x) <= goal.halfExtents.x
          && Math.abs((body.position.y - verticalExtent) - goal.position.y) <= 0.34
        : Math.abs(body.position.x - goal.position.x) <= goal.halfExtents.x
          && Math.abs(body.position.y - goal.position.y) <= goal.halfExtents.y;
      inGoal = inside && (!this.level.phaseCheckpoint || this.phase === 1);
      if (body.position.y < -7.3 || Math.abs(body.position.x) > 5.2) this.failed = true;
    }
    this.goalHold = inGoal ? this.goalHold + dt : 0;
    if (this.goalHold >= this.goalHoldRequired) this.completed = true;
  }

  private get goalHoldRequired(): number {
    return 0.25;
  }

  private resolveWheelPlacement(target: Vec2): Vec2 {
    let resolved = { ...target };
    for (let pass = 0; pass < 3; pass += 1) {
      for (const platform of this.level.platforms) {
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
    for (const platform of this.level.platforms) {
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
    const clearanceTime = 0.02 / sweepDistance;
    return lerp(start, end, Math.max(0, earliest - clearanceTime));
  }

  private collectHiddenBolt(): void {
    if (!this.hiddenBoltCollected && distance(this.wheelPosition, this.level.bolt) < 0.58) {
      this.hiddenBoltCollected = true;
    }
  }
}
