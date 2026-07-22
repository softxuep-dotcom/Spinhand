import type { Vec2 } from "../math/vec2";

export type TargetId = "ball" | "box" | "gear";

export interface BodyRenderState {
  position: Vec2;
  rotation: number;
  linearVelocity: Vec2;
  angularVelocity: number;
}

export interface ContactFeedback {
  targetId: TargetId;
  point: Vec2;
  normal: Vec2;
  tangent: Vec2;
  impulse: number;
  invalidDeep: boolean;
}

export interface PlatformState {
  position: Vec2;
  halfExtents: Vec2;
  rotation: number;
}

export interface SimulationRenderState {
  wheel: {
    position: Vec2;
    previousPosition: Vec2;
    active: boolean;
  };
  ball: BodyRenderState;
  box: BodyRenderState;
  gear: {
    position: Vec2;
    rotation: number;
    angularVelocity: number;
  };
  contacts: readonly ContactFeedback[];
  platforms: readonly PlatformState[];
}
