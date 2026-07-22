import {
  WHEEL_GAIN,
  WHEEL_MAX_IMPULSE,
  WHEEL_SURFACE_SPEED,
} from "../config";
import { clamp, dot, type Vec2 } from "../math/vec2";

export interface ImpulseRequest {
  tangent: Vec2;
  contactVelocity: Vec2;
  effectiveMass: number;
  dt: number;
  surfaceSpeed?: number;
  gain?: number;
  maximum?: number;
}

export function calculateTangentialImpulse({
  tangent,
  contactVelocity,
  effectiveMass,
  dt,
  surfaceSpeed = WHEEL_SURFACE_SPEED,
  gain = WHEEL_GAIN,
  maximum = WHEEL_MAX_IMPULSE,
}: ImpulseRequest): number {
  const relativeSpeed = Math.max(0, surfaceSpeed - dot(contactVelocity, tangent));
  return clamp(gain * relativeSpeed * Math.max(0, effectiveMass) * dt, 0, maximum);
}
