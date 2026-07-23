import type { Vec2 } from "../math/vec2";
import type { PlatformState } from "../simulation/types";

export type LevelObjectKind = "ball" | "box" | "foam" | "glass" | "disc" | "cart" | "package" | "doll";
export type MechanismKind = "rack" | "bolt" | "plunger" | "gear" | "pulley" | "winch" | "valve";
export type MechanismResponse = "slider" | "rotor";
export type GoalKind = "cup" | "plate" | "slot" | "seal" | "dock" | "shelf" | "bell";

export interface CampaignChapter {
  id: number;
  name: string;
  description: string;
  reward: string;
  start: number;
  end: number;
}

export interface CampaignLevel {
  id: number;
  chapter: number;
  name: string;
  verb: string;
  hint: string;
  phaseHint?: string;
  accent: number;
  wheelStart?: Vec2;
  object?: {
    kind: LevelObjectKind;
    start: Vec2;
    radius?: number;
    halfExtents?: Vec2;
    density?: number;
    friction?: number;
    restitution?: number;
    linearDamping?: number;
    angularDamping?: number;
    breakStress?: number;
    goalMaxSpeed?: number;
  };
  mechanism?: {
    kind: MechanismKind;
    response?: MechanismResponse;
    axis: "x" | "y";
    start: Vec2;
    halfExtents: Vec2;
    radius?: number;
    minimum: number;
    maximum: number;
    target: number;
    effectImpulse?: Vec2;
  };
  mechanismThenObject?: boolean;
  goal: {
    kind: GoalKind;
    position: Vec2;
    halfExtents: Vec2;
    entry?: "left" | "right" | "top" | "bottom";
    motion?: { axis: "x" | "y"; amplitude: number; speed: number; phase?: number };
  };
  bolt: Vec2;
  platforms: readonly PlatformState[];
  phaseCheckpoint?: { position: Vec2; halfExtents: Vec2 };
}

export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = [
  { id: 1, name: "认识轮缘", description: "接触哪一侧，就决定力量去向。", reward: "黄铜轮皮 · 玩具台", start: 1, end: 5 },
  { id: 2, name: "学会控制力度", description: "接触时长、重量与刹车共同决定停点。", reward: "软胶轮皮 · 泡沫球", start: 6, end: 10 },
  { id: 3, name: "给机器上动力", description: "让同一套轮缘规则驱动齿轮、滑轮与阀门。", reward: "钢蓝轮皮 · 滑轮组", start: 11, end: 15 },
  { id: 4, name: "沿形状借力", description: "跟随坡面、墙面与反弹轨迹持续接触。", reward: "紫晶轮皮 · 弹板", start: 16, end: 20 },
  { id: 5, name: "让物体互相工作", description: "先改变环境，再让下一件物体完成任务。", reward: "珊瑚轮皮 · 货架", start: 21, end: 25 },
  { id: 6, name: "工坊考试", description: "把控力、换边、机关与时机串成完整流程。", reward: "大师轮皮 · 总装铃", start: 26, end: 30 },
];

export const TOTAL_LEVELS = 30;

export const campaignChapterForLevel = (level: number): CampaignChapter =>
  CAMPAIGN_CHAPTERS.find((chapter) => level >= chapter.start && level <= chapter.end) ?? CAMPAIGN_CHAPTERS[0]!;

export const isRoundObject = (kind: LevelObjectKind): boolean =>
  kind === "ball" || kind === "foam" || kind === "glass" || kind === "disc";

const sideWalls: readonly PlatformState[] = [
  { position: { x: -4.36, y: 0 }, halfExtents: { x: 0.18, y: 7.2 }, rotation: 0 },
  { position: { x: 4.36, y: 0 }, halfExtents: { x: 0.18, y: 7.2 }, rotation: 0 },
];

const floor = (y = -2.72, x = 0, width = 4.12, surface: PlatformState["surface"] = "standard"): PlatformState => ({
  position: { x, y }, halfExtents: { x: width, y: 0.17 }, rotation: 0, surface,
});
const platform = (x: number, y: number, width: number, rotation = 0, surface: PlatformState["surface"] = "standard"): PlatformState => ({
  position: { x, y }, halfExtents: { x: width, y: 0.14 }, rotation, surface,
});
const withWalls = (...platforms: PlatformState[]): readonly PlatformState[] => [...sideWalls, ...platforms];

export const CAMPAIGN_LEVELS: readonly CampaignLevel[] = [
  {
    id: 1, chapter: 1, name: "拨齿条", verb: "贴住齿条下沿", hint: "上轮缘向右 · 推入卡槽", accent: 0x4ac6ff,
    wheelStart: { x: -2.45, y: -2.4 },
    mechanism: { kind: "rack", axis: "x", start: { x: -2.45, y: -1.4 }, halfExtents: { x: 0.92, y: 0.28 }, minimum: -2.45, maximum: 1.35, target: 1.12 },
    goal: { kind: "slot", position: { x: 1.55, y: -1.4 }, halfExtents: { x: 0.5, y: 0.56 } }, bolt: { x: 0.15, y: -0.65 },
    platforms: withWalls(
      { position: { x: -0.55, y: -0.86 }, halfExtents: { x: 3.35, y: 0.12 }, rotation: 0 },
      { position: { x: -3.5, y: -1.4 }, halfExtents: { x: 0.12, y: 0.52 }, rotation: 0 },
      { position: { x: 2.15, y: -1.4 }, halfExtents: { x: 0.12, y: 0.7 }, rotation: 0 },
    ),
  },
  {
    id: 2, chapter: 1, name: "往回扫", verb: "换到上方", hint: "下轮缘向左", accent: 0xff8f62,
    wheelStart: { x: 2.48, y: -0.49 }, object: { kind: "box", start: { x: 2.3, y: -1.85 }, halfExtents: { x: 0.64, y: 0.64 }, density: 1.2 },
    goal: { kind: "plate", position: { x: -2.65, y: -2.48 }, halfExtents: { x: 0.9, y: 0.16 } }, bolt: { x: 0.45, y: -1.05 },
    platforms: withWalls(floor(-2.65)),
  },
  {
    id: 3, chapter: 1, name: "提门栓", verb: "贴住右侧", hint: "左轮缘向上", accent: 0xb698ff,
    mechanism: { kind: "bolt", axis: "y", start: { x: 0.35, y: -1.8 }, halfExtents: { x: 0.48, y: 1.05 }, minimum: -1.8, maximum: 2.2, target: 1.62 },
    goal: { kind: "slot", position: { x: 0.35, y: 2.25 }, halfExtents: { x: 0.7, y: 0.34 } }, bolt: { x: -1.55, y: 0.6 },
    platforms: withWalls(platform(0.35, -3.1, 1.3), { position: { x: -0.42, y: 0.15 }, halfExtents: { x: 0.12, y: 3.05 }, rotation: 0 }),
  },
  {
    id: 4, chapter: 1, name: "压冲头", verb: "贴住左侧", hint: "右轮缘向下", accent: 0xff657a,
    mechanism: { kind: "plunger", axis: "y", start: { x: 0.2, y: 2.1 }, halfExtents: { x: 0.58, y: 0.92 }, minimum: -2.25, maximum: 2.1, target: -1.62 },
    goal: { kind: "seal", position: { x: 0.2, y: -2.45 }, halfExtents: { x: 0.88, y: 0.3 } }, bolt: { x: 1.7, y: -0.35 },
    platforms: withWalls({ position: { x: 1.02, y: 0 }, halfExtents: { x: 0.12, y: 3.3 }, rotation: 0 }, platform(0.2, -3, 1.25)),
  },
  {
    id: 5, chapter: 1, name: "两次换边", verb: "先右，再左", hint: "用相反轮缘接力", phaseHint: "下轮缘向左 · 扫回接收杯", accent: 0x63e7b1,
    object: { kind: "ball", start: { x: -2.75, y: -2.16 }, radius: 0.56, density: 1.05, friction: 0.22, restitution: 0.12, linearDamping: 0.28, angularDamping: 1.35 },
    goal: { kind: "cup", position: { x: 0.95, y: -1.42 }, halfExtents: { x: 0.76, y: 0.72 }, entry: "right" }, bolt: { x: 2.8, y: 0.65 },
    phaseCheckpoint: { position: { x: 2.25, y: -1.58 }, halfExtents: { x: 0.7, y: 0.34 } },
    platforms: withWalls(
      { ...floor(-2.82, 0, 4.08, "guide"), friction: 0.18, blocksWheel: false },
      { ...platform(-0.55, -2.45, 1.25, 0.31, "guide"), friction: 0.18, blocksWheel: false },
      { ...platform(2, -2.3, 1.5, 0, "guide"), friction: 0.24, blocksWheel: false },
      { position: { x: -3.75, y: -2.18 }, halfExtents: { x: 0.12, y: 0.72 }, rotation: 0 },
    ),
  },

  // Chapter 2 · contact duration, mass and braking.
  {
    id: 6, chapter: 2, name: "轻一点", verb: "短擦后松手", hint: "泡沫球很轻 · 别让它过冲", accent: 0x75dcff,
    object: { kind: "foam", start: { x: -2.45, y: -1.95 }, radius: 0.54, density: 0.32, friction: 0.24, restitution: 0.48, linearDamping: 0.16, goalMaxSpeed: 2.2 },
    goal: { kind: "cup", position: { x: 1.15, y: -1.92 }, halfExtents: { x: 0.78, y: 0.7 }, entry: "left" }, bolt: { x: -0.35, y: -0.65 },
    platforms: withWalls(floor(-2.62, -0.65, 3.3), { position: { x: 2.15, y: -2.05 }, halfExtents: { x: 0.12, y: 0.75 }, rotation: 0 }),
  },
  {
    id: 7, chapter: 2, name: "重家伙", verb: "持续贴住箱底", hint: "粗糙地面会吃掉动量", accent: 0xf7a85b,
    object: { kind: "box", start: { x: -2.65, y: -1.93 }, halfExtents: { x: 0.66, y: 0.66 }, density: 2.35, linearDamping: 0.7, angularDamping: 3.2 },
    goal: { kind: "slot", position: { x: 2.45, y: -1.93 }, halfExtents: { x: 0.8, y: 0.82 } }, bolt: { x: 0.1, y: -0.7 },
    platforms: withWalls({ ...floor(-2.65), friction: 1.25 }),
  },
  {
    id: 8, chapter: 2, name: "抽上层", verb: "只擦上方圆盘", hint: "接触高度决定选中谁", accent: 0x8fa5ff,
    object: { kind: "disc", start: { x: -2.3, y: -0.93 }, radius: 0.5, density: 0.78, friction: 0.38, restitution: 0.12 },
    goal: { kind: "shelf", position: { x: 2.45, y: -0.92 }, halfExtents: { x: 0.72, y: 0.62 } }, bolt: { x: 0.2, y: 0.2 },
    platforms: withWalls(floor(-2.72), platform(-2.3, -1.48, 0.72), platform(2.45, -1.55, 0.85)),
  },
  {
    id: 9, chapter: 2, name: "别碰碎", verb: "轻擦并反向制动", hint: "红火花意味着冲量过大", accent: 0x8cecff,
    object: { kind: "glass", start: { x: -2.7, y: 0.6 }, radius: 0.5, density: 0.72, friction: 0.18, restitution: 0.2, breakStress: 0.85, goalMaxSpeed: 1.15 },
    goal: { kind: "plate", position: { x: 2.42, y: -2.47 }, halfExtents: { x: 0.86, y: 0.16 } }, bolt: { x: -0.25, y: 1.05 },
    platforms: withWalls(platform(-1.25, -0.55, 2.25, -0.23, "guide"), platform(1.85, -2.1, 1.55, 0, "guide"), floor(-2.65)),
  },
  {
    id: 10, chapter: 2, name: "精准停靠", verb: "加速后换边刹车", hint: "低速停在窄维修区", accent: 0xffcb67,
    object: { kind: "cart", start: { x: -2.7, y: -2.02 }, halfExtents: { x: 0.72, y: 0.48 }, density: 1.35, linearDamping: 0.42, angularDamping: 4.2, goalMaxSpeed: 0.55 },
    goal: { kind: "dock", position: { x: 1.55, y: -2.48 }, halfExtents: { x: 0.72, y: 0.18 } }, bolt: { x: 0.1, y: -0.85 },
    platforms: withWalls(floor(-2.65)),
  },

  // Chapter 3 · the same tangent drives constrained rotors and visible chains.
  {
    id: 11, chapter: 3, name: "点亮发电机", verb: "沿齿轮外缘稳定接触", hint: "转满一圈点亮线圈", accent: 0x64e6a6,
    wheelStart: { x: 0, y: -1.95 }, mechanism: { kind: "gear", response: "rotor", axis: "x", start: { x: 0, y: -0.25 }, halfExtents: { x: 0.88, y: 0.88 }, radius: 0.88, minimum: 0, maximum: 6.28, target: 6.28 },
    goal: { kind: "seal", position: { x: 0, y: -0.25 }, halfExtents: { x: 1.18, y: 1.18 } }, bolt: { x: 2.3, y: 0.65 }, platforms: withWalls(floor(-3.05)),
  },
  {
    id: 12, chapter: 3, name: "抬门过球", verb: "先转齿轮，再送球", hint: "机关亮绿后换到球下方", phaseHint: "门已抬起 · 把球送进右杯", accent: 0x76c8ff,
    wheelStart: { x: -2.2, y: -0.75 }, object: { kind: "ball", start: { x: -2.65, y: -2.05 }, radius: 0.54, restitution: 0.14 },
    mechanism: { kind: "gear", response: "rotor", axis: "x", start: { x: -2.2, y: 0.9 }, halfExtents: { x: 0.82, y: 0.82 }, radius: 0.82, minimum: 0, maximum: 4.7, target: 4.7 }, mechanismThenObject: true,
    goal: { kind: "cup", position: { x: 2.45, y: -1.85 }, halfExtents: { x: 0.78, y: 0.72 }, entry: "left" }, bolt: { x: 0.25, y: 0.1 }, platforms: withWalls(floor(-2.72)),
  },
  {
    id: 13, chapter: 3, name: "活传送带", verb: "先驱动左侧滑轮", hint: "滑轮蓄满后货物开始移动", phaseHint: "传送带已启动 · 扫货物到压板", accent: 0x55e0c5,
    wheelStart: { x: -2.45, y: -0.85 }, object: { kind: "package", start: { x: 1.95, y: -1.92 }, halfExtents: { x: 0.55, y: 0.55 }, density: 1.05 },
    mechanism: { kind: "pulley", response: "rotor", axis: "x", start: { x: -2.45, y: 0.65 }, halfExtents: { x: 0.72, y: 0.72 }, radius: 0.72, minimum: 0, maximum: 5.2, target: 5.2, effectImpulse: { x: -1.4, y: 0 } }, mechanismThenObject: true,
    goal: { kind: "plate", position: { x: -0.35, y: -2.48 }, halfExtents: { x: 0.82, y: 0.16 } }, bolt: { x: 2.7, y: 0.2 }, platforms: withWalls({ ...floor(-2.65), surface: "slick", friction: 0.16 }),
  },
  {
    id: 14, chapter: 3, name: "绞盘电梯", verb: "转绞盘升起载台", hint: "亮绿后把箱子推出", phaseHint: "平台到位 · 把箱子送进高层槽", accent: 0xc19aff,
    wheelStart: { x: -2.5, y: -0.75 }, object: { kind: "box", start: { x: 1.35, y: -1.82 }, halfExtents: { x: 0.62, y: 0.62 }, density: 1.4 },
    mechanism: { kind: "winch", response: "rotor", axis: "x", start: { x: -2.5, y: 0.85 }, halfExtents: { x: 0.76, y: 0.76 }, radius: 0.76, minimum: 0, maximum: 5.6, target: 5.6, effectImpulse: { x: 0, y: 2.4 } }, mechanismThenObject: true,
    goal: { kind: "shelf", position: { x: 2.45, y: -0.85 }, halfExtents: { x: 0.82, y: 0.72 } }, bolt: { x: 0, y: 0.25 }, platforms: withWalls(floor(-2.65), platform(2.45, -1.55, 0.95)),
  },
  {
    id: 15, chapter: 3, name: "泄压阀", verb: "把阀门转到标记", hint: "停在亮区释放活塞", phaseHint: "压力释放 · 接住弹出的球", accent: 0xff7b6f,
    wheelStart: { x: -2.55, y: -0.75 }, object: { kind: "ball", start: { x: -0.15, y: -2.05 }, radius: 0.52, restitution: 0.18 },
    mechanism: { kind: "valve", response: "rotor", axis: "x", start: { x: -2.55, y: 0.85 }, halfExtents: { x: 0.78, y: 0.78 }, radius: 0.78, minimum: 0, maximum: 4.4, target: 4.4, effectImpulse: { x: 3.2, y: 2.9 } }, mechanismThenObject: true,
    goal: { kind: "cup", position: { x: 2.65, y: -1.35 }, halfExtents: { x: 0.76, y: 0.76 }, entry: "left" }, bolt: { x: 0.55, y: 0.7 }, platforms: withWalls(floor(-2.7), platform(1.45, -2.0, 1.55, 0.2, "guide")),
  },

  // Chapter 4 · follow geometry and moving targets.
  {
    id: 16, chapter: 4, name: "弧面加速", verb: "沿下缘持续跟随", hint: "坡面会保存滚动速度", accent: 0x58c9ff,
    object: { kind: "ball", start: { x: -2.85, y: -1.95 }, radius: 0.55, restitution: 0.16, friction: 0.24 }, goal: { kind: "cup", position: { x: 2.65, y: -1.3 }, halfExtents: { x: 0.78, y: 0.78 }, entry: "left" }, bolt: { x: 0.15, y: 0.25 },
    platforms: withWalls(platform(-1.6, -2.4, 1.65, 0.18, "guide"), platform(1.25, -1.95, 1.55, 0.17, "guide"), platform(2.65, -2.08, 0.9)),
  },
  {
    id: 17, chapter: 4, name: "竖井上升", verb: "始终贴住球右侧", hint: "左轮缘把球沿墙抬起", accent: 0x91a7ff,
    wheelStart: { x: -1.55, y: -2.05 }, object: { kind: "ball", start: { x: -2.75, y: -2.05 }, radius: 0.54, friction: 0.42, restitution: 0.08, linearDamping: 0.32 },
    goal: { kind: "shelf", position: { x: -2.75, y: 2.15 }, halfExtents: { x: 0.74, y: 0.7 } }, bolt: { x: 0.2, y: 0.6 },
    platforms: withWalls(floor(-2.72), { position: { x: -3.52, y: -0.05 }, halfExtents: { x: 0.12, y: 2.65 }, rotation: 0 }, platform(-2.75, 1.45, 0.85)),
  },
  {
    id: 18, chapter: 4, name: "S 弯", verb: "左右换侧向上", hint: "每道挡板都要求换边", accent: 0xd094ff,
    object: { kind: "ball", start: { x: -1.8, y: -2.15 }, radius: 0.5, restitution: 0.1, linearDamping: 0.28 }, goal: { kind: "cup", position: { x: 1.75, y: 2.15 }, halfExtents: { x: 0.76, y: 0.74 }, entry: "bottom" }, bolt: { x: 0, y: 0.45 },
    platforms: withWalls(floor(-2.72), platform(-1.2, -0.65, 1.8, 0.08, "guide"), platform(1.2, 0.75, 1.8, -0.08, "guide"), platform(1.75, 1.45, 0.9)),
  },
  {
    id: 19, chapter: 4, name: "反弹接力", verb: "预判折返点", hint: "球折返后从另一侧再接触", accent: 0xff8b7a,
    object: { kind: "ball", start: { x: -2.65, y: -1.95 }, radius: 0.53, restitution: 0.62, friction: 0.18 }, goal: { kind: "cup", position: { x: -1.8, y: 1.75 }, halfExtents: { x: 0.78, y: 0.75 }, entry: "right" }, bolt: { x: 1.2, y: 0.35 },
    platforms: withWalls(platform(-1.5, -2.42, 1.7, 0.15, "guide"), platform(2.25, -1.25, 1.25, -0.62), platform(-1.8, 1.02, 0.92)),
  },
  {
    id: 20, chapter: 4, name: "移动篮筐", verb: "观察篮筐往返节奏", hint: "先加速，再选择释放时机", accent: 0x5be4b2,
    object: { kind: "ball", start: { x: 0, y: -2.05 }, radius: 0.52, restitution: 0.2 }, goal: { kind: "cup", position: { x: 0, y: 1.55 }, halfExtents: { x: 0.72, y: 0.72 }, entry: "bottom", motion: { axis: "x", amplitude: 2.05, speed: 0.72 } }, bolt: { x: 3, y: -0.25 },
    platforms: withWalls(floor(-2.72), platform(0, 0.1, 2.8, 0.08, "guide")),
  },

  // Chapter 5 · visible cause-and-effect chains built from the same public responses.
  {
    id: 21, chapter: 5, name: "球带齿", verb: "先给棘轮蓄力", hint: "亮绿后再发射球", phaseHint: "门已升起 · 把球送入出口", accent: 0xffc45a,
    wheelStart: { x: -2.5, y: -0.7 }, object: { kind: "ball", start: { x: -2.6, y: -2.05 }, radius: 0.53, restitution: 0.18 },
    mechanism: { kind: "gear", response: "rotor", axis: "x", start: { x: -2.5, y: 0.85 }, halfExtents: { x: 0.76, y: 0.76 }, radius: 0.76, minimum: 0, maximum: 4.8, target: 4.8 }, mechanismThenObject: true,
    goal: { kind: "shelf", position: { x: 2.55, y: -1.55 }, halfExtents: { x: 0.78, y: 0.72 } }, bolt: { x: 0.2, y: 0.4 }, platforms: withWalls(floor(-2.72), platform(2.55, -2.25, 0.92)),
  },
  {
    id: 22, chapter: 5, name: "先抬再滚", verb: "先抬起挡块", hint: "挡块到位后才能送球", phaseHint: "通道打开 · 从球下方持续向右", accent: 0x8f9cff,
    wheelStart: { x: -0.25, y: -0.7 }, object: { kind: "ball", start: { x: -2.65, y: -2.05 }, radius: 0.54, restitution: 0.12 },
    mechanism: { kind: "bolt", axis: "y", start: { x: -1.45, y: -1.45 }, halfExtents: { x: 0.36, y: 0.72 }, minimum: -1.45, maximum: 1.1, target: 0.78 }, mechanismThenObject: true,
    goal: { kind: "cup", position: { x: 2.55, y: -1.9 }, halfExtents: { x: 0.78, y: 0.72 }, entry: "left" }, bolt: { x: 0.45, y: 0.55 }, platforms: withWalls(floor(-2.72)),
  },
  {
    id: 23, chapter: 5, name: "箱子当墙", verb: "先把靠背停稳", hint: "沿箱边把货物送上货架", accent: 0xe49b62,
    object: { kind: "package", start: { x: -2.55, y: -1.98 }, halfExtents: { x: 0.55, y: 0.55 }, density: 1.1, goalMaxSpeed: 1.1 },
    goal: { kind: "shelf", position: { x: 2.45, y: -0.85 }, halfExtents: { x: 0.76, y: 0.72 } }, bolt: { x: -0.1, y: 0.3 },
    platforms: withWalls(floor(-2.72), { position: { x: 1.38, y: -1.55 }, halfExtents: { x: 0.14, y: 1.0 }, rotation: 0 }, platform(2.45, -1.55, 0.9)),
  },
  {
    id: 24, chapter: 5, name: "双滑轮", verb: "驱动主轮带动副轮", hint: "持续接触直到双灯点亮", accent: 0x60d9c2,
    wheelStart: { x: -1.1, y: -1.15 }, mechanism: { kind: "pulley", response: "rotor", axis: "x", start: { x: 0, y: 0.25 }, halfExtents: { x: 0.92, y: 0.92 }, radius: 0.92, minimum: 0, maximum: 9.4, target: 9.4 },
    goal: { kind: "seal", position: { x: 0, y: 0.25 }, halfExtents: { x: 1.3, y: 1.3 } }, bolt: { x: 2.6, y: -1.15 }, platforms: withWalls(floor(-3)),
  },
  {
    id: 25, chapter: 5, name: "接住货物", verb: "从右侧向上托住", hint: "跟住下落货物送进货架", accent: 0xff8c6c,
    wheelStart: { x: 1.3, y: 1.8 }, object: { kind: "package", start: { x: 0, y: 2.7 }, halfExtents: { x: 0.5, y: 0.5 }, density: 0.82, linearDamping: 0.34 },
    goal: { kind: "shelf", position: { x: 2.55, y: -0.7 }, halfExtents: { x: 0.78, y: 0.72 } }, bolt: { x: -2.35, y: 0.75 }, platforms: withWalls(floor(-2.72), platform(2.55, -1.4, 0.9)),
  },

  // Chapter 6 · combined exam layouts, no new player verb.
  {
    id: 26, chapter: 6, name: "脆弱快递", verb: "先开电梯再轻推", hint: "玻璃货物承受不了猛擦", phaseHint: "电梯到位 · 轻触送入软垫", accent: 0x8fe9ff,
    wheelStart: { x: -2.55, y: -0.75 }, object: { kind: "glass", start: { x: 0.2, y: -2.0 }, radius: 0.5, density: 0.72, breakStress: 0.95, goalMaxSpeed: 1.1, restitution: 0.12 },
    mechanism: { kind: "winch", response: "rotor", axis: "x", start: { x: -2.55, y: 0.85 }, halfExtents: { x: 0.76, y: 0.76 }, radius: 0.76, minimum: 0, maximum: 5.8, target: 5.8, effectImpulse: { x: 0, y: 2 } }, mechanismThenObject: true,
    goal: { kind: "plate", position: { x: 2.55, y: -2.47 }, halfExtents: { x: 0.82, y: 0.16 } }, bolt: { x: 0, y: 0.55 }, platforms: withWalls(floor(-2.65)),
  },
  {
    id: 27, chapter: 6, name: "齿轮反向", verb: "主齿轮带动惰轮", hint: "齿列会把方向反转到门栓", accent: 0xb49aff,
    wheelStart: { x: -1.25, y: -1.4 }, mechanism: { kind: "gear", response: "rotor", axis: "x", start: { x: 0, y: 0 }, halfExtents: { x: 0.95, y: 0.95 }, radius: 0.95, minimum: 0, maximum: 8.2, target: 8.2 },
    goal: { kind: "seal", position: { x: 0, y: 0 }, halfExtents: { x: 1.2, y: 1.2 } }, bolt: { x: -2.65, y: 1.25 }, platforms: withWalls(floor(-3)),
  },
  {
    id: 28, chapter: 6, name: "运动中接力", verb: "先升平台，再接球", hint: "离开滑轮后立刻切到球下方", phaseHint: "平台仍在上升 · 把球送上去", accent: 0x5ed6b0,
    wheelStart: { x: -2.5, y: -0.75 }, object: { kind: "ball", start: { x: 0.45, y: -2.05 }, radius: 0.52, restitution: 0.14 },
    mechanism: { kind: "pulley", response: "rotor", axis: "x", start: { x: -2.5, y: 0.85 }, halfExtents: { x: 0.76, y: 0.76 }, radius: 0.76, minimum: 0, maximum: 5.2, target: 5.2, effectImpulse: { x: 0, y: 2.6 } }, mechanismThenObject: true,
    goal: { kind: "shelf", position: { x: 2.45, y: 0.45 }, halfExtents: { x: 0.78, y: 0.74 } }, bolt: { x: 0.25, y: 1.15 }, platforms: withWalls(floor(-2.72), platform(2.45, -0.28, 0.9)),
  },
  {
    id: 29, chapter: 6, name: "三步救援", verb: "先停下压机", hint: "冲头到位后抬起玩偶", phaseHint: "安全锁定 · 向上托起再送出口", accent: 0xff6f82,
    wheelStart: { x: -1.05, y: 1.65 }, object: { kind: "doll", start: { x: -1.8, y: -2.0 }, halfExtents: { x: 0.44, y: 0.62 }, density: 0.75, linearDamping: 0.4, angularDamping: 2.6 },
    mechanism: { kind: "plunger", axis: "y", start: { x: 0.2, y: 2.15 }, halfExtents: { x: 0.56, y: 0.82 }, minimum: -0.2, maximum: 2.15, target: 0.15 }, mechanismThenObject: true,
    goal: { kind: "shelf", position: { x: 2.55, y: -0.75 }, halfExtents: { x: 0.76, y: 0.76 } }, bolt: { x: -2.65, y: 0.65 }, platforms: withWalls(floor(-2.72), platform(2.55, -1.5, 0.92)),
    phaseCheckpoint: { position: { x: -1.05, y: -0.65 }, halfExtents: { x: 0.72, y: 0.84 } },
  },
  {
    id: 30, chapter: 6, name: "总装测试", verb: "启动总装齿轮", hint: "亮绿后沿坡连续送球敲铃", phaseHint: "总装线已启动 · 把球送到顶端铃", accent: 0xffd35f,
    wheelStart: { x: -2.55, y: -0.75 }, object: { kind: "ball", start: { x: -0.35, y: -2.05 }, radius: 0.54, friction: 0.28, restitution: 0.18 },
    mechanism: { kind: "gear", response: "rotor", axis: "x", start: { x: -2.55, y: 0.85 }, halfExtents: { x: 0.8, y: 0.8 }, radius: 0.8, minimum: 0, maximum: 6.8, target: 6.8, effectImpulse: { x: 2.4, y: 1.8 } }, mechanismThenObject: true,
    goal: { kind: "bell", position: { x: 2.55, y: 1.7 }, halfExtents: { x: 0.72, y: 0.72 } }, bolt: { x: 0.25, y: 0.75 },
    phaseCheckpoint: { position: { x: 1.2, y: -0.65 }, halfExtents: { x: 0.78, y: 0.72 } },
    platforms: withWalls(floor(-2.72), platform(0.75, -1.9, 1.45, 0.22, "guide"), platform(2.1, -0.45, 1.35, 0.35, "guide"), platform(2.55, 0.98, 0.82)),
  },
];

export const CHAPTER_ONE_LEVELS = CAMPAIGN_LEVELS.slice(0, 5);

export const getCampaignLevel = (level: number): CampaignLevel =>
  CAMPAIGN_LEVELS[Math.max(0, Math.min(CAMPAIGN_LEVELS.length - 1, level - 1))]!;
