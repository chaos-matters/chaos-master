export const PREFILTER_WHITE = 255

export function flam3CalcAlpha(
  density: number,
  gamma: number,
  linrange: number,
): number {
  if (density <= 0) return 0

  const funcval = Math.pow(linrange, gamma)

  if (density < linrange) {
    const frac = density / linrange
    return (
      (1 - frac) * density * (funcval / linrange) +
      frac * Math.pow(density, gamma)
    )
  }

  return Math.pow(density, gamma)
}

/**
 * RGB to OkLab conversion (D65 illuminant).
 * L is discarded since we use fixed L=0.7 for rendering.
 * Returns normalized a/b in range roughly -1 to 1.
 */
export function rgbToOklab(
  r: number,
  g: number,
  b: number,
): { a: number; b: number } {
  const toLinear = (c: number) =>
    c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92

  const rLin = toLinear(r / 255)
  const gLin = toLinear(g / 255)
  const bLin = toLinear(b / 255)

  // Linear RGB to XYZ (D65)
  const x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin
  const y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin
  const z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin

  // XYZ to Lab (D65)
  const xn = 0.95047,
    yn = 1.0,
    zn = 1.08883

  const f = (t: number) =>
    t > 0.008856 ? Math.pow(t, 1 / 3) : (903.3 * t + 16) / 116

  const fx = f(x / xn)
  const fy = f(y / yn)
  const fz = f(z / zn)

  const a = 500 * (fx - fy)
  const bLab = 200 * (fy - fz)

  // Normalize to roughly -1 to 1
  return { a: a / 100, b: bLab / 100 }
}
