import type { Vec2 } from "../math/vec2";
import type { BodyRenderState, ContactFeedback, PlatformState } from "../simulation/types";
import type { CampaignLevel, GoalKind, LevelObjectKind, MechanismKind } from "./levels";

export interface CampaignRenderState {
  level: CampaignLevel;
  wheel: { position: Vec2; previousPosition: Vec2; active: boolean };
  object?: BodyRenderState & { kind: LevelObjectKind };
  mechanism?: {
    kind: MechanismKind;
    axis: "x" | "y";
    position: Vec2;
    halfExtents: Vec2;
    progress: number;
  };
  goal: { kind: GoalKind; position: Vec2; halfExtents: Vec2; progress: number };
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
