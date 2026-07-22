export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, value: number): Vec2 => ({ x: a.x * value, y: a.y * value });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const lengthSq = (a: Vec2): number => dot(a, a);
export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export const normalize = (a: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 => {
  const magnitude = length(a);
  return magnitude > 1e-7 ? scale(a, 1 / magnitude) : { ...fallback };
};

export const rotate = (a: Vec2, angle: number): Vec2 => {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: a.x * cosine - a.y * sine,
    y: a.x * sine + a.y * cosine,
  };
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const clockwiseTangent = (radial: Vec2): Vec2 => normalize({ x: radial.y, y: -radial.x });
