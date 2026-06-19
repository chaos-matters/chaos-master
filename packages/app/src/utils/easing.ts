import type { EasingCurve } from './timeline'

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function applyEasing(t: number, curve: EasingCurve): number {
  switch (curve) {
    case 'linear':
      return t
    case 'easeIn':
      return t * t * t
    case 'easeOut':
      return 1 - (1 - t) ** 3
    case 'easeInOut':
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
    case 'bounce':
      return bounce(t)
    case 'elastic':
      return elastic(t)
    default:
      return t
  }
}

function bounce(t: number): number {
  const n1 = 7.5625
  const d1 = 2.75

  if (t < 1 / d1) {
    return n1 * t * t
  } else if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75
  } else if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375
  } else {
    return n1 * (t -= 2.625 / d1) * t + 0.984375
  }
}

function elastic(t: number): number {
  const c4 = (2 * Math.PI) / 3

  return t === 0
    ? 0
    : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Catmull-Rom spline interpolation between p1 and p2, using p0 and p3 as the
 * adjacent control points to derive auto-tangents (cubic Hermite basis). Passes
 * through p1 at t=0 and p2 at t=1. At the ends, callers clamp by passing the
 * boundary value for the missing neighbour (p0=p1 / p3=p2). Mirrors the spline
 * used by IFSRenderer and JWildfire (tension 0.5).
 */
export function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  const t2 = t * t
  const t3 = t2 * t
  const h1 = 2 * t3 - 3 * t2 + 1
  const h2 = -2 * t3 + 3 * t2
  const h3 = t3 - 2 * t2 + t
  const h4 = t3 - t2
  const m1 = (p2 - p0) / 2
  const m2 = (p3 - p1) / 2
  return h1 * p1 + h2 * p2 + h3 * m1 + h4 * m2
}
