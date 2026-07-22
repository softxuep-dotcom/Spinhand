import { WHEEL_DEEP_LIMIT } from "../config";
import {
  add,
  clamp,
  distance,
  lerp,
  normalize,
  rotate,
  scale,
  sub,
  type Vec2,
} from "../math/vec2";

export type ContactShape =
  | { kind: "circle"; radius: number }
  | { kind: "box"; halfExtents: Vec2 };

export interface ShapeTransform {
  position: Vec2;
  rotation: number;
}

export interface ShapeSample {
  signedDistance: number;
  point: Vec2;
  normal: Vec2;
}

export interface SweepHit extends ShapeSample {
  wheelCenter: Vec2;
  time: number;
  depth: number;
  invalidDeep: boolean;
}

function sampleCircle(point: Vec2, transform: ShapeTransform, radius: number): ShapeSample {
  const centerToPoint = sub(point, transform.position);
  const normal = normalize(centerToPoint, { x: 0, y: 1 });
  return {
    signedDistance: distance(point, transform.position) - radius,
    point: add(transform.position, scale(normal, radius)),
    normal,
  };
}

function sampleBox(point: Vec2, transform: ShapeTransform, halfExtents: Vec2): ShapeSample {
  const local = rotate(sub(point, transform.position), -transform.rotation);
  const clamped = {
    x: clamp(local.x, -halfExtents.x, halfExtents.x),
    y: clamp(local.y, -halfExtents.y, halfExtents.y),
  };
  const outside = sub(local, clamped);
  const outsideDistance = distance(outside, { x: 0, y: 0 });

  let localPoint = clamped;
  let localNormal: Vec2;
  let signedDistance: number;

  if (outsideDistance > 1e-7) {
    localNormal = normalize(outside);
    signedDistance = outsideDistance;
  } else {
    const distanceToX = halfExtents.x - Math.abs(local.x);
    const distanceToY = halfExtents.y - Math.abs(local.y);
    if (distanceToX < distanceToY) {
      const sign = local.x >= 0 ? 1 : -1;
      localPoint = { x: halfExtents.x * sign, y: local.y };
      localNormal = { x: sign, y: 0 };
      signedDistance = -distanceToX;
    } else {
      const sign = local.y >= 0 ? 1 : -1;
      localPoint = { x: local.x, y: halfExtents.y * sign };
      localNormal = { x: 0, y: sign };
      signedDistance = -distanceToY;
    }
  }

  return {
    signedDistance,
    point: add(transform.position, rotate(localPoint, transform.rotation)),
    normal: rotate(localNormal, transform.rotation),
  };
}

export function sampleShape(point: Vec2, shape: ContactShape, transform: ShapeTransform): ShapeSample {
  return shape.kind === "circle"
    ? sampleCircle(point, transform, shape.radius)
    : sampleBox(point, transform, shape.halfExtents);
}

export function sweepWheelAgainstShape(
  start: Vec2,
  end: Vec2,
  wheelRadius: number,
  rimWidth: number,
  shape: ContactShape,
  transform: ShapeTransform,
): SweepHit | null {
  const sweepDistance = distance(start, end);
  const sampleSpacing = Math.max(0.035, rimWidth * 0.35);
  const sampleCount = Math.min(256, Math.max(1, Math.ceil(sweepDistance / sampleSpacing)));
  let deepHit: SweepHit | null = null;

  for (let index = 0; index <= sampleCount; index += 1) {
    const time = index / sampleCount;
    const wheelCenter = lerp(start, end, time);
    const sample = sampleShape(wheelCenter, shape, transform);
    const depth = wheelRadius - sample.signedDistance;

    if (sample.signedDistance <= wheelRadius + rimWidth) {
      const invalidDeep = depth > WHEEL_DEEP_LIMIT;
      const hit = { ...sample, wheelCenter, time, depth, invalidDeep };
      if (!invalidDeep) return hit;
      deepHit ??= hit;
    }
  }

  return deepHit;
}
