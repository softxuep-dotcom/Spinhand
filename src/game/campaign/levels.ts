import type { Vec2 } from "../math/vec2";
import type { PlatformState } from "../simulation/types";

export type LevelObjectKind = "ball" | "box";
export type MechanismKind = "bolt" | "plunger";
export type GoalKind = "cup" | "plate" | "slot" | "seal";

export interface CampaignLevel {
  id: number;
  name: string;
  verb: string;
  hint: string;
  accent: number;
  object?: {
    kind: LevelObjectKind;
    start: Vec2;
    radius?: number;
    halfExtents?: Vec2;
    density?: number;
  };
  mechanism?: {
    kind: MechanismKind;
    start: Vec2;
    halfExtents: Vec2;
    minimumY: number;
    maximumY: number;
    targetY: number;
  };
  goal: {
    kind: GoalKind;
    position: Vec2;
    halfExtents: Vec2;
  };
  bolt: Vec2;
  platforms: readonly PlatformState[];
  phaseCheckpoint?: { x: number; y: number };
}

const sideWalls: readonly PlatformState[] = [
  { position: { x: -4.36, y: 0 }, halfExtents: { x: 0.18, y: 7.2 }, rotation: 0 },
  { position: { x: 4.36, y: 0 }, halfExtents: { x: 0.18, y: 7.2 }, rotation: 0 },
];

export const CHAPTER_ONE_LEVELS: readonly CampaignLevel[] = [
  {
    id: 1,
    name: "向右搓",
    verb: "从下方切入",
    hint: "上轮缘向右",
    accent: 0x4ac6ff,
    object: { kind: "ball", start: { x: -2.35, y: -1.94 }, radius: 0.56, density: 1.05 },
    goal: { kind: "cup", position: { x: -0.55, y: -2.2 }, halfExtents: { x: 1.2, y: 0.76 } },
    bolt: { x: 0.15, y: -0.65 },
    platforms: [
      ...sideWalls,
      { position: { x: -1.55, y: -2.62 }, halfExtents: { x: 2.25, y: 0.16 }, rotation: 0 },
      { position: { x: -0.55, y: -2.85 }, halfExtents: { x: 1.2, y: 0.16 }, rotation: 0 },
      { position: { x: 0.65, y: -2.05 }, halfExtents: { x: 0.12, y: 0.72 }, rotation: 0 },
    ],
  },
  {
    id: 2,
    name: "往回扫",
    verb: "换到上方",
    hint: "下轮缘向左",
    accent: 0xff8f62,
    object: { kind: "box", start: { x: 2.3, y: -1.85 }, halfExtents: { x: 0.64, y: 0.64 }, density: 1.2 },
    goal: { kind: "plate", position: { x: -2.65, y: -2.48 }, halfExtents: { x: 0.9, y: 0.16 } },
    bolt: { x: 0.45, y: -1.05 },
    platforms: [
      ...sideWalls,
      { position: { x: 0, y: -2.65 }, halfExtents: { x: 4.15, y: 0.18 }, rotation: 0 },
    ],
  },
  {
    id: 3,
    name: "提门栓",
    verb: "贴住右侧",
    hint: "左轮缘向上",
    accent: 0xb698ff,
    mechanism: {
      kind: "bolt",
      start: { x: 0.35, y: -1.8 },
      halfExtents: { x: 0.48, y: 1.05 },
      minimumY: -1.8,
      maximumY: 2.2,
      targetY: 1.62,
    },
    goal: { kind: "slot", position: { x: 0.35, y: 2.25 }, halfExtents: { x: 0.7, y: 0.34 } },
    bolt: { x: -1.55, y: 0.6 },
    platforms: [
      ...sideWalls,
      { position: { x: 0.35, y: -3.1 }, halfExtents: { x: 1.3, y: 0.2 }, rotation: 0 },
      { position: { x: -0.42, y: 0.15 }, halfExtents: { x: 0.12, y: 3.05 }, rotation: 0 },
      { position: { x: 1.12, y: 0.15 }, halfExtents: { x: 0.12, y: 3.05 }, rotation: 0 },
    ],
  },
  {
    id: 4,
    name: "压冲头",
    verb: "贴住左侧",
    hint: "右轮缘向下",
    accent: 0xff657a,
    mechanism: {
      kind: "plunger",
      start: { x: 0.2, y: 2.1 },
      halfExtents: { x: 0.58, y: 0.92 },
      minimumY: -2.25,
      maximumY: 2.1,
      targetY: -1.62,
    },
    goal: { kind: "seal", position: { x: 0.2, y: -2.45 }, halfExtents: { x: 0.88, y: 0.3 } },
    bolt: { x: 1.7, y: -0.35 },
    platforms: [
      ...sideWalls,
      { position: { x: -0.62, y: 0 }, halfExtents: { x: 0.12, y: 3.3 }, rotation: 0 },
      { position: { x: 1.02, y: 0 }, halfExtents: { x: 0.12, y: 3.3 }, rotation: 0 },
      { position: { x: 0.2, y: -3.0 }, halfExtents: { x: 1.25, y: 0.2 }, rotation: 0 },
    ],
  },
  {
    id: 5,
    name: "两次换边",
    verb: "先右，再左",
    hint: "用相反轮缘接力",
    accent: 0x63e7b1,
    object: { kind: "ball", start: { x: -2.65, y: -2.18 }, radius: 0.56, density: 1.05 },
    goal: { kind: "cup", position: { x: -2.75, y: -2.2 }, halfExtents: { x: 0.72, y: 0.72 } },
    bolt: { x: 2.8, y: 0.65 },
    phaseCheckpoint: { x: 1.45, y: -2.35 },
    platforms: [
      ...sideWalls,
      { position: { x: 0, y: -2.82 }, halfExtents: { x: 4.08, y: 0.16 }, rotation: 0 },
      { position: { x: -3.5, y: -2.2 }, halfExtents: { x: 0.12, y: 0.72 }, rotation: 0 },
    ],
  },
];

export const getCampaignLevel = (level: number): CampaignLevel =>
  CHAPTER_ONE_LEVELS[Math.max(0, Math.min(CHAPTER_ONE_LEVELS.length - 1, level - 1))]!;
