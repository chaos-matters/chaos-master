/**
 * OkLab → CSS-RGB conversion helper.
 *
 * The active color-map system lives in `colorMap.ts`; this module previously
 * also carried a second, parallel `ColorMap`/`defaultColorMaps`/`applyColorMap`
 * implementation that nothing imported. Those unused exports were removed — the
 * only symbol used elsewhere is `oklabToRgbForCss`.
 */

/**
 * Convert OkLab a/b channels to an RGB CSS string for CSS gradient compatibility.
 * Uses the CSS Color Level 4 conversion formula.
 * oklab() in CSS gradients is NOT widely supported, so we pre-compute RGB values.
 */
export function oklabToRgbForCss(
  a: number,
  b: number,
  lightness = 0.7,
): string {
  const L = lightness
  const l = L + 0.3963377774 * a + 0.2158037573 * b
  const m = L - 0.1055613458 * a - 0.0638541728 * b
  const s = L - 0.0894841775 * a - 1.291485548 * b

  const l_ = l * l * l
  const m_ = m * m * m
  const s_ = s * s * s

  const rLin = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_
  const gLin = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_
  const bLin = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_

  const toSrgb = (c: number) =>
    c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  const r = Math.round(Math.max(0, Math.min(255, toSrgb(rLin) * 255)))
  const g = Math.round(Math.max(0, Math.min(255, toSrgb(gLin) * 255)))
  const bv = Math.round(Math.max(0, Math.min(255, toSrgb(bLin) * 255)))

  return `rgb(${r}, ${g}, ${bv})`
}
