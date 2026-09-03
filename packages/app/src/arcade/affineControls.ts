import type { AffineParams } from '@/flame/affineTranform'

/**
 * An affine as six things a person can reason about.
 *
 * The stored form is the matrix `x' = ax + by + c`, `y' = dx + ey + f`, which
 * is the right thing to render from and the wrong thing to put in front of
 * someone with ninety seconds on a clock. Nobody thinks "raise b to 0.31";
 * they think "rotate it a bit and squash it".
 *
 * This is the standard QR-style decomposition: rotate, then shear along x,
 * then scale. It round-trips exactly for any invertible matrix, and a
 * degenerate one (zero determinant) still decomposes without dividing by
 * zero, so a flattened transform stays editable rather than becoming NaN.
 */
export type AffineControls = {
  scaleX: number
  scaleY: number
  /** Radians. */
  rotation: number
  shear: number
  offsetX: number
  offsetY: number
}

export function decomposeAffine(affine: AffineParams): AffineControls {
  const { a, b, c, d, e, f } = affine
  const scaleX = Math.hypot(a, d)
  const determinant = a * e - b * d
  // A zero-width transform has no rotation to recover and no shear to divide
  // by: hand back something neutral rather than NaN, so the panel still works.
  if (scaleX === 0) {
    return {
      scaleX: 0,
      scaleY: Math.hypot(b, e),
      rotation: 0,
      shear: 0,
      offsetX: c,
      offsetY: f,
    }
  }
  return {
    scaleX,
    scaleY: determinant / scaleX,
    rotation: Math.atan2(d, a),
    shear: determinant === 0 ? 0 : (a * b + d * e) / determinant,
    offsetX: c,
    offsetY: f,
  }
}

export function composeAffine(
  controls: AffineControls,
  keep?: AffineParams,
): AffineParams {
  const { scaleX, scaleY, rotation, shear, offsetX, offsetY } = controls
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    // The 3D coefficients (g..l), if this flame has them, are not ours to
    // touch: a duel is 2D, but the same transform may carry them.
    ...keep,
    a: scaleX * cos,
    b: scaleY * (shear * cos - sin),
    c: offsetX,
    d: scaleX * sin,
    e: scaleY * (shear * sin + cos),
    f: offsetY,
  }
}

/** One control's range and step, for the scrub fields. */
export type AffineControlSpec = {
  key: keyof AffineControls
  label: string
  min: number
  max: number
  step: number
  /** Shown to the reader; radians are not a unit anyone scrubs in. */
  toDisplay: (value: number) => number
  fromDisplay: (value: number) => number
}

const identity = (value: number) => value
const DEGREES = 180 / Math.PI

export const AFFINE_CONTROLS: readonly AffineControlSpec[] = [
  {
    key: 'scaleX',
    label: 'X scale',
    min: -3,
    max: 3,
    step: 0.01,
    toDisplay: identity,
    fromDisplay: identity,
  },
  {
    key: 'scaleY',
    label: 'Y scale',
    min: -3,
    max: 3,
    step: 0.01,
    toDisplay: identity,
    fromDisplay: identity,
  },
  {
    key: 'rotation',
    label: 'Rotate',
    min: -180,
    max: 180,
    step: 1,
    toDisplay: (value) => value * DEGREES,
    fromDisplay: (value) => value / DEGREES,
  },
  {
    key: 'shear',
    label: 'Shear',
    min: -2,
    max: 2,
    step: 0.01,
    toDisplay: identity,
    fromDisplay: identity,
  },
  {
    key: 'offsetX',
    label: 'X offset',
    min: -2,
    max: 2,
    step: 0.01,
    toDisplay: identity,
    fromDisplay: identity,
  },
  {
    key: 'offsetY',
    label: 'Y offset',
    min: -2,
    max: 2,
    step: 0.01,
    toDisplay: identity,
    fromDisplay: identity,
  },
]
