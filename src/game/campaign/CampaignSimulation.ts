import RAPIER from "@dimforge/rapier2d-compat";
import {
  FIXED_DT,
  WHEEL_FILTER_TIME,
  WHEEL_RADIUS,
  WHEEL_RIM_WIDTH,
} from "../config";
import type { ControlSample } from "../input/InputController";
import { clamp, clockwiseTangent, distance, lerp, scale, sub, type Vec2 } from "../math/vec2";
import { calculateTangentialImpulse } from "../simulation/contactMath";
import { sweepWheelAgainstShape, type ContactShape } from "../simulation/sweep";
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
  private mechanismY = 0;
  private mechanismVelocity = 0;
  private goalHold = 0;
  private phase = 0;
  private hiddenBoltCollected = false;
  private completed = false;
  private failed = false;

  constructor(readonly level: CampaignLevel) {
    const object = level.object;
    const mechanism = level.mechanism;
    if (object) {
      const extent = object.kind === "ball" ? object.radius ?? 0.56 : object.halfExtents?.y ?? 0.64;
      const above = level.id === 2;
      this.wheelPosition = {
        x: object.start.x + (above ? 0.18 : -0.18),
        y: object.start.y + (above ? extent + WHEEL_RADIUS : -extent - WHEEL_RADIUS),
      };
    } else if (mechanism) {
      const toRight = mechanism.kind === "bolt";
      this.wheelPosition = {
        x: mechanism.start.x + (toRight ? 1 : -1) * (mechanism.halfExtents.x + WHEEL_RADIUS),
        y: mechanism.start.y,
      };
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
          .setFriction(0.82)
          .setRestitution(0.08),
        body,
      );
    }

    if (level.object) {
      this.objectBody = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(level.object.start.x, level.object.start.y)
          .setLinearDamping(level.object.kind === "box" ? 0.55 : 0.2)
          .setAngularDamping(level.object.kind === "box" ? 2.4 : 0.12)
          .setCcdEnabled(true),
      );
      if (level.object.kind === "ball") {
        const radius = level.object.radius ?? 0.56;
        this.objectShape = { kind: "circle", radius };
        this.world.createCollider(
          RAPIER.ColliderDesc.ball(radius)
            .setDensity(level.object.density ?? 1)
            .setFriction(0.68)
            .setRestitution(0.36),
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
    this.mechanismY = level.mechanism?.start.y ?? 0;
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
      this.wheelPosition = { ...control.target };
      this.previousWheelPosition = { ...control.target };
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
    let current = { ...this.wheelPosition };
    for (let index = 0; index < substeps; index += 1) {
      const next = lerp(current, target, 1 / (substeps - index));
      this.applySweep(current, next, dt / substeps);
      this.stepWorld(dt / substeps);
      this.stepMechanism(dt / substeps);
      current = next;
    }
    this.wheelPosition = target;
    this.collectHiddenBolt();
    this.hadContact = this.contacts.some((contact) => !contact.invalidDeep && contact.impulse > 0);
    this.evaluateState(dt);
  }

  getRenderState(): CampaignRenderState {
    const mechanism = this.level.mechanism;
    const mechanismRange = mechanism ? mechanism.maximumY - mechanism.minimumY : 1;
    const progress = mechanism
      ? clamp(
          mechanism.kind === "bolt"
            ? (this.mechanismY - mechanism.minimumY) / mechanismRange
            : (mechanism.maximumY - this.mechanismY) / mechanismRange,
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
            position: { x: mechanism.start.x, y: this.mechanismY },
            halfExtents: mechanism.halfExtents,
            progress,
          }
        : undefined,
      goal: {
        ...this.level.goal,
        progress: clamp(this.goalHold / 0.25, 0, 1),
      },
      contacts: this.contacts,
      platforms: this.level.platforms,
      hiddenBolt: { position: this.level.bolt, collected: this.hiddenBoltCollected },
      phase: this.phase,
      completed: this.completed,
      failed: this.failed,
    };
  }

  private applySweep(start: Vec2, end: Vec2, dt: number): void {
    // Campaign targets use a slightly more expressive production tune than the
    // conservative P0 sandbox while retaining a strict per-substep cap.
    let remaining = 0.78;
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
          const impulse = Math.min(
            remaining,
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
            remaining -= impulse;
          }
        }
        this.contacts.push(feedback);
      }
    }

    const mechanism = this.level.mechanism;
    if (mechanism && remaining > 0) {
      const hit = sweepWheelAgainstShape(
        start,
        end,
        WHEEL_RADIUS,
        WHEEL_RIM_WIDTH,
        { kind: "box", halfExtents: mechanism.halfExtents },
        { position: { x: mechanism.start.x, y: this.mechanismY }, rotation: 0 },
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
          const impulse = Math.min(
            remaining,
            calculateTangentialImpulse({
              tangent,
              contactVelocity: { x: 0, y: this.mechanismVelocity },
              effectiveMass: 1.6,
              dt,
              surfaceSpeed: 8.6,
              gain: 11,
              maximum: 0.48,
            }),
          );
          this.mechanismVelocity += (tangent.y * impulse) / 1.6;
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
    this.mechanismY = clamp(
      this.mechanismY + this.mechanismVelocity * dt,
      mechanism.minimumY,
      mechanism.maximumY,
    );
    if (this.mechanismY === mechanism.minimumY || this.mechanismY === mechanism.maximumY) {
      this.mechanismVelocity = 0;
    }
  }

  private evaluateState(dt: number): void {
    let inGoal = false;
    if (this.level.mechanism) {
      inGoal = this.level.mechanism.kind === "bolt"
        ? this.mechanismY >= this.level.mechanism.targetY
        : this.mechanismY <= this.level.mechanism.targetY;
    } else if (this.objectBody) {
      const body = readBody(this.objectBody);
      if (this.level.phaseCheckpoint && this.phase === 0) {
        if (body.position.x >= this.level.phaseCheckpoint.x && body.position.y >= this.level.phaseCheckpoint.y) {
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
    if (this.goalHold >= 0.25) this.completed = true;
  }

  private collectHiddenBolt(): void {
    if (!this.hiddenBoltCollected && distance(this.wheelPosition, this.level.bolt) < 0.58) {
      this.hiddenBoltCollected = true;
    }
  }
}
