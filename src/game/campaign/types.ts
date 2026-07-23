import type { Vec2 } from "../math/vec2";
import type { BodyRenderState, ContactFeedback, PlatformState } from "../simulation/types";
import type { CampaignLevel, GoalKind, LevelObjectKind, MechanismKind } from "./levels";

export interface CampaignRenderState {
  level: CampaignLevel;
  wheel: { position: Vec2; previousPosition: Vec2; active: boolean };
  object?: BodyRenderState & { kind: LevelObjectKind };
  mechanism?: {
    kind: MechanismKind;
    response: "slider" | "rotor";
    axis: "x" | "y";
    position: Vec2;
    halfExtents: Vec2;
    radius: number;
    rotation: number;
    angularVelocity: number;
    progress: number;
  };
  goal: {
    kind: GoalKind;
    position: Vec2;
    halfExtents: Vec2;
    entry?: "left" | "right" | "top" | "bottom";
    progress: number;
    active: boolean;
  };
  contacts: readonly ContactFeedback[];
  platforms: readonly PlatformState[];
  hiddenBolt: { position: Vec2; collected: boolean };
  phase: number;
  completed: boolean;
  failed: boolean;
}

export interface LevelResult {
  level: number;
  noRestart: boolean;
  hiddenBolt: boolean;
}
