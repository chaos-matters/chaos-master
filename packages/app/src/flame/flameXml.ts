import { addCustomPalette, loadCustomPalettes, paletteEntry } from './colorMap'
import { rgbToOklab } from './flam3PaletteParser'
import { validateFlame } from './schema/flameSchema'
import { generateTransformId } from './transformFunction'
import { allTransformVariations, isVariationType, variationTypes, } from './variations'
import { getNormalizedVariationName, getVariationDefault, } from './variations/utils'
import type { Palette, PaletteEntry } from './colorMap'
import type { FlameDescriptor } from './schema/flameSchema'

// ── flam3 variation name → chaos-master internal type mapping ──────────────
//
// Chaos-master's variation types are the same names flam3 uses, suffixed with
// "Var" (or "3D"): `pie` → `pieVar`, `julian` → `juliaNVar`, `wedge_julia` →
// `wedgeJuliaVar`, etc. So instead of a hand-maintained table (which drifts and
// mis-mapped dozens of real variations to `linearVar`), we DERIVE the mapping
// from the live registry: normalize every registered 2D type to a key and look
// the incoming flam3 name up against it. New variations are covered for free.

/** Strip the `Var`/`3D` suffix and all separators, lowercase — so `wedgeJuliaVar`
 *  and flam3's `wedge_julia` collapse to the same key (`wedgejulia`). */
function normKey(name: string): string {
  return getNormalizedVariationName(name).replace(/_/g, '').toLowerCase()
}

// Registry-derived: normalized flam3 name → canonical chaos type. 2D only —
// a .flame file is always 2D, and several 3D variants share a base name with a
// 2D one (`squareVar` vs `square3D`), so we must not resolve to the 3D variant.
const NORMALIZED_TO_TYPE: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const type of variationTypes) {
    const key = normKey(type)
    if (!map.has(key)) map.set(key, type)
  }
  return map
})()

// True exceptions the registry can't resolve by name alone — flam3 names that
// differ from chaos-master's, validated against the registry at module load so
// a typo or a removed target fails loudly in dev instead of silently breaking
// an import. Anything resolvable by normalized name (the vast majority) is NOT
// listed here.
// (gaussian_blur, pre_blur, wedge_julia, julian, juliascope, pie, ngon, … all
// resolve straight from the registry by normalized name — no alias needed.)
const FLAM3_ALIASES_RAW: Record<string, string> = {
  sinusoidal: 'sinVar', // flam3 var #1 — registry has no "sinusoidalVar"
  sinusodial: 'sinVar', // historical flam3 misspelling
  blur: 'circleBlurVar', // flam3 "blur" fills a disc — closest CM blur
  flatten: 'preFlattenVar', // flam3 flatten (zeros z) ↔ CM preFlatten
  post_mirror: 'postMirrorWfVar', // Apophysis post_mirror plugin
}
const FLAM3_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(FLAM3_ALIASES_RAW).filter(([flam3, chaos]) => {
    if (isVariationType(chaos)) return true
    console.warn(
      `[flameXml] alias "${flam3}" → "${chaos}" is not a valid variation type; ignoring`,
    )
    return false
  }),
)

// These aliases are useful fallbacks, but they are not mathematically exact.
// Keep them importable while making the compatibility report honest about the
// visual difference.
const APPROXIMATE_FLAM3_ALIASES = new Set(['blur'])

/**
 * Resolve a flam3 variation name to a chaos-master internal type, or `undefined`
 * if it has no equivalent (so the caller can skip it and report it). Order:
 *   1. explicit flam3 alias (true exceptions),
 *   2. registry match by normalized name (covers the overwhelming majority),
 *   3. the name is already a valid chaos type.
 */
export function resolveVariationType(flam3Name: string): string | undefined {
  const cleaned = flam3Name.trim()
  if (cleaned === '') return undefined
  const key = normKey(cleaned)

  const alias = FLAM3_ALIASES[cleaned.toLowerCase()] ?? FLAM3_ALIASES[key]
  if (alias !== undefined) return alias

  const fromRegistry = NORMALIZED_TO_TYPE.get(key)
  if (fromRegistry !== undefined) return fromRegistry

  if (isVariationType(cleaned)) return cleaned

  return undefined
}

// ── Parse helpers ──────────────────────────────────────────────────────────

function parseFloatSafe(s: string | null, fallback = 0): number {
  if (s === null) return fallback
  const v = parseFloat(s)
  return Number.isFinite(v) ? v : fallback
}

function parseIntSafe(s: string | null, fallback = 0): number {
  if (s === null) return fallback
  const v = parseInt(s, 10)
  return Number.isFinite(v) ? v : fallback
}

function parseNumberArray(s: string | null, count: number): number[] {
  if (s === null || s === '') return new Array<number>(count).fill(0)
  const parts = s.trim().split(/\s+/).map(Number)
  const result: number[] = []
  for (let i = 0; i < count; i++) {
    result.push(Number.isFinite(parts[i]) ? parts[i]! : 0)
  }
  return result
}

type Rgb = { r: number; g: number; b: number }

/**
 * Unpack a flam3 `coefs`/`post` string into a chaos-master affine.
 *
 * flam3 stores the affine as three 2-vectors written in the order
 * `c00 c01 c10 c11 c20 c21`, applied as:
 *   x' = c00·x + c10·y + c20
 *   y' = c01·x + c11·y + c21
 * chaos-master's affine is `{a,b,c,d,e,f}` with x' = a·x + b·y + c,
 * y' = d·x + e·y + f — so the string indices map as
 *   a=[0]  b=[2]  c=[4]  d=[1]  e=[3]  f=[5].
 */
function affineFromCoefs(coefs: number[]): Record<string, number> {
  return {
    a: coefs[0] ?? 1,
    b: coefs[2] ?? 0,
    c: coefs[4] ?? 0,
    d: coefs[1] ?? 0,
    e: coefs[3] ?? 1,
    f: coefs[5] ?? 0,
  }
}

const IDENTITY_AFFINE: Record<string, number> = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 1,
  f: 0,
}

/** Compose two affines: apply `inner` first, then `outer` (outer ∘ inner). */
function composeAffine(
  outer: Record<string, number>,
  inner: Record<string, number>,
): Record<string, number> {
  return {
    a: outer.a! * inner.a! + outer.b! * inner.d!,
    b: outer.a! * inner.b! + outer.b! * inner.e!,
    c: outer.a! * inner.c! + outer.b! * inner.f! + outer.c!,
    d: outer.d! * inner.a! + outer.e! * inner.d!,
    e: outer.d! * inner.b! + outer.e! * inner.e!,
    f: outer.d! * inner.c! + outer.e! * inner.f! + outer.f!,
  }
}

/** Param keys of a chaos parametric variation (empty for non-parametric). */
function variationParamKeys(chaosType: string): string[] {
  const registry = allTransformVariations as Record<
    string,
    { paramDefaults?: Record<string, number> } | undefined
  >
  const v = registry[chaosType]
  return v?.paramDefaults ? Object.keys(v.paramDefaults) : []
}

/** Normalize a param name for matching (drop separators, lowercase). */
function normParam(name: string): string {
  return name.replace(/_/g, '').toLowerCase()
}

// xform attributes that are NOT variations (flame geometry / bookkeeping).
const NON_VARIATION_ATTRS = new Set([
  'weight',
  'color',
  'coefs',
  'post',
  'opacity',
  'color_speed',
  'animate',
  'symmetry',
  'name',
  'chaos',
  'plots',
])

// Recognised flam3 xform controls that Chaos Master does not currently model.
// They are bookkeeping rather than variations, but an active value still
// changes the source flame and therefore must make an import explicitly lossy.
const UNSUPPORTED_XFORM_ATTRS = new Set(['animate', 'chaos', 'plots'])

function hasActiveNumericValue(value: string): boolean {
  const values = value.trim().split(/\s+/)
  if (values.length === 0 || values[0] === '') return false
  return values.some((token) => {
    const parsed = Number(token)
    return !Number.isFinite(parsed) || parsed !== 0
  })
}

/**
 * Parse an xform's variations (both the attribute form `linear="1"` and the
 * child `<var name="linear" weight="1"/>` form), resolving each to a chaos type
 * and folding in any parametric parameters. flam3 stores a parametric
 * variation's parameters as sibling attributes prefixed with the variation name
 * (`julian="0.5" julian_power="3" julian_dist="1"`); we strip that prefix and
 * match the remainder against the chaos variation's own parameter keys.
 */
function parseVariations(
  el: Element,
  unmapped: Set<string>,
  approximated: Set<string>,
): Record<string, unknown> {
  type Resolved = {
    flam3Name: string
    chaosType: string
    weight: number
    paramKeys: string[]
  }

  // Pass 1 — attribute-form variation weights (those that resolve to a type).
  const vars: Resolved[] = []
  const varNames = new Set<string>()
  for (const attr of el.attributes) {
    const lower = attr.name.toLowerCase()
    if (NON_VARIATION_ATTRS.has(lower)) continue
    const weight = parseFloatSafe(attr.value, 0)
    if (weight === 0) continue
    const chaosType = resolveVariationType(attr.name)
    if (chaosType === undefined) continue // maybe a param of another variation
    if (APPROXIMATE_FLAM3_ALIASES.has(lower)) approximated.add(attr.name)
    vars.push({
      flam3Name: lower,
      chaosType,
      weight,
      paramKeys: variationParamKeys(chaosType),
    })
    varNames.add(lower)
  }

  // Pass 2 — parameters: attach each remaining attr to the variation whose name
  // is its longest matching prefix. Longest-first so `pre_blur_*` beats `pre_*`.
  const byLen = [...vars].sort(
    (a, b) => b.flam3Name.length - a.flam3Name.length,
  )
  const paramsFor = new Map<string, Record<string, number>>()
  const consumed = new Set<string>()
  for (const attr of el.attributes) {
    const lower = attr.name.toLowerCase()
    if (NON_VARIATION_ATTRS.has(lower) || varNames.has(lower)) continue
    const owner = byLen.find(
      (v) => v.paramKeys.length > 0 && lower.startsWith(`${v.flam3Name}_`),
    )
    if (!owner) continue
    const flam3Param = lower.slice(owner.flam3Name.length + 1)
    const chaosKey = owner.paramKeys.find(
      (k) => normParam(k) === normParam(flam3Param),
    )
    if (chaosKey === undefined) continue
    const map = paramsFor.get(owner.flam3Name) ?? {}
    map[chaosKey] = parseFloatSafe(attr.value, 0)
    paramsFor.set(owner.flam3Name, map)
    consumed.add(lower)
  }

  // Anything left that's neither a known variation nor a recognized param and
  // doesn't resolve is genuinely unsupported — report it.
  for (const attr of el.attributes) {
    const lower = attr.name.toLowerCase()
    if (NON_VARIATION_ATTRS.has(lower) || varNames.has(lower)) continue
    if (consumed.has(lower)) continue
    if (!hasActiveNumericValue(attr.value)) continue
    if (resolveVariationType(attr.name) === undefined) unmapped.add(attr.name)
  }

  // Build descriptors.
  const variations: Record<string, unknown> = {}
  let count = 0
  for (const v of vars) {
    const def = getVariationDefault(v.chaosType, v.weight)
    const extra = paramsFor.get(v.flam3Name)
    if (extra) {
      const withParams = def as { params?: Record<string, number> }
      if (withParams.params) {
        withParams.params = { ...withParams.params, ...extra }
      }
    }
    variations[`_flam3_${count++}`] = def
  }

  // Child <var> form (chaos-master's own export; carries no parameters).
  for (const varEl of el.querySelectorAll('var')) {
    const name = varEl.getAttribute('name') ?? ''
    const weight = parseFloatSafe(varEl.getAttribute('weight'), 0)
    if (weight === 0) continue
    const chaosType = resolveVariationType(name)
    if (chaosType === undefined) {
      unmapped.add(name)
      continue
    }
    if (APPROXIMATE_FLAM3_ALIASES.has(name.toLowerCase())) {
      approximated.add(name)
    }
    variations[`_flam3_${count++}`] = getVariationDefault(chaosType, weight)
  }

  // Every transform needs at least one variation; flam3 implies linear.
  if (count === 0) {
    variations['_flam3_default'] = getVariationDefault('linearVar', 1)
  }
  return variations
}

/** Does an xform/finalxform carry any variation other than plain linear? */
function hasNonLinearVariation(el: Element): boolean {
  for (const attr of el.attributes) {
    const lower = attr.name.toLowerCase()
    if (NON_VARIATION_ATTRS.has(lower)) continue
    if (parseFloatSafe(attr.value, 0) === 0) continue
    const type = resolveVariationType(attr.name)
    if (type !== 'linearVar') return true
  }
  for (const varEl of el.querySelectorAll('var')) {
    const w = parseFloatSafe(varEl.getAttribute('weight'), 0)
    if (w === 0) continue
    const type = resolveVariationType(varEl.getAttribute('name') ?? '')
    if (type !== 'linearVar') return true
  }
  return false
}

// ── Embedded palette ─────────────────────────────────────────────────────────

/**
 * Parse the 256-colour gradient embedded in a `<flame><palette></flame>`.
 * Handles all three encodings seen in the wild:
 *   - Apophysis text content: hex triplets (`format="RGB"` → RRGGBB,
 *     `format="RGBA"` → RRGGBBAA) whitespace-wrapped inside the element,
 *   - the official flam3 `data="00RRGGBB…"` attribute (alpha-prefixed), and
 *   - `<color index rgb="r g b" />` / `red`/`green`/`blue` children.
 * Returns an empty array when there's no usable palette.
 */
function parsePaletteColors(flameEl: Element): Rgb[] {
  const paletteEl = flameEl.querySelector('palette')
  if (!paletteEl) return []

  // <color> children (extended format).
  const colorNodes = paletteEl.querySelectorAll('color')
  if (colorNodes.length > 0) {
    const colors: Rgb[] = []
    for (const node of colorNodes) {
      const rgbAttr = node.getAttribute('rgb')
      if (rgbAttr !== null) {
        const [r, g, b] = parseNumberArray(rgbAttr, 3)
        colors.push({ r: r ?? 0, g: g ?? 0, b: b ?? 0 })
        continue
      }
      // red/green/blue children are 0–1 floats.
      const r = parseFloatSafe(node.getAttribute('red'), 0)
      const g = parseFloatSafe(node.getAttribute('green'), 0)
      const b = parseFloatSafe(node.getAttribute('blue'), 0)
      colors.push({ r: r * 255, g: g * 255, b: b * 255 })
    }
    return colors
  }

  const dataAttr = paletteEl.getAttribute('data')
  if (dataAttr !== null) {
    // Official flam3: 8 hex chars per colour, "00RRGGBB".
    const hex = dataAttr.replace(/[^0-9a-fA-F]/g, '')
    const colors: Rgb[] = []
    for (let i = 0; i + 8 <= hex.length; i += 8) {
      colors.push({
        r: parseInt(hex.slice(i + 2, i + 4), 16),
        g: parseInt(hex.slice(i + 4, i + 6), 16),
        b: parseInt(hex.slice(i + 6, i + 8), 16),
      })
    }
    return colors
  }

  // Apophysis text content: hex run, RGB (6) or RGBA/ARGB (8) per colour.
  const format = (paletteEl.getAttribute('format') ?? 'RGB').toUpperCase()
  const stride = format === 'RGBA' || format === 'ARGB' ? 8 : 6
  const argb = format === 'ARGB'
  const hex = (paletteEl.textContent ?? '').replace(/[^0-9a-fA-F]/g, '')
  const colors: Rgb[] = []
  for (let i = 0; i + stride <= hex.length; i += stride) {
    const off = argb ? i + 2 : i
    colors.push({
      r: parseInt(hex.slice(off, off + 2), 16),
      g: parseInt(hex.slice(off + 2, off + 4), 16),
      b: parseInt(hex.slice(off + 4, off + 6), 16),
    })
  }
  return colors
}

/** Sample a gradient (ordered colour list) at t∈[0,1] with linear interpolation. */
function sampleGradient(colors: Rgb[], t: number): Rgb {
  if (colors.length === 0) return { r: 255, g: 255, b: 255 }
  if (colors.length === 1) return colors[0]!
  const clamped = Math.max(0, Math.min(1, t))
  const exact = clamped * (colors.length - 1)
  const lo = Math.floor(exact)
  const hi = Math.min(lo + 1, colors.length - 1)
  const f = exact - lo
  const a = colors[lo]!
  const b = colors[hi]!
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  }
}

// ── Main parser ────────────────────────────────────────────────────────────

/** Result of a .flame import: the flame plus any non-fatal warnings (e.g.
 *  variations with no chaos-master equivalent that were skipped). */
export type FlameXmlReport = {
  flame: FlameDescriptor
  warnings: string[]
}

/**
 * Parse a .flame XML string into a chaos-master FlameDescriptor, returning any
 * non-fatal warnings alongside it (skipped variations, dropped finalxform
 * variations) so the UI can surface them. {@link parseFlameXml} is the plain
 * wrapper that logs the warnings to the console instead.
 *
 * Coordinate system: flam3 uses `center` (world-space image centre) and `scale`
 * (pixels per world unit); chaos-master uses camera `position` and a normalized
 * `zoom`. Per-transform colour comes from the embedded palette sampled at each
 * xform's `color` index (the flam3 colouring model), baked into the transform's
 * OkLab colour so the import renders true to the original without needing a
 * palette object selected.
 */
function parseFlameElementWithReport(flameEl: Element): FlameXmlReport {
  const warnings: string[] = []

  // ── Flame-level attributes ────────────────────────────────────────────

  const name = flameEl.getAttribute('name') ?? ''
  const size = parseNumberArray(flameEl.getAttribute('size'), 2)
  const center = parseNumberArray(flameEl.getAttribute('center'), 2)
  const scale = parseFloatSafe(flameEl.getAttribute('scale'), 200)
  const background = parseNumberArray(flameEl.getAttribute('background'), 3)
  const brightness = parseFloatSafe(flameEl.getAttribute('brightness'), 4)
  const gamma = parseFloatSafe(flameEl.getAttribute('gamma'), 2.2)
  const filter = parseFloatSafe(flameEl.getAttribute('filter'), 0.5)
  const quality = parseIntSafe(flameEl.getAttribute('quality'), 100)

  // flam3 background is usually 0–255, occasionally 0–1.
  const bgColor: [number, number, number] = background.map((v) =>
    v > 1 ? v / 255 : v,
  ) as [number, number, number]

  // flam3 center/scale → camera position/zoom. scale = pixels per world unit;
  // chaos zoom is normalized by half the largest image dimension.
  const maxDim = Math.max(size[0] ?? 800, size[1] ?? 600)
  const half = maxDim / 2
  const cameraZoom = half > 0 ? scale / half : 1
  // flam3 center is the world point shown at image centre; camera position is
  // the negated centre in the same normalized units.
  const cameraPosition: [number, number] = [
    -(center[0] ?? 0) / half,
    -(center[1] ?? 0) / half,
  ]

  // flam3 brightness (~1–20) → chaos exposure (−8…8), log approximation.
  const exposure = Math.max(-8, Math.min(8, Math.log2(brightness || 4) * 1.5))
  // Higher flam3 quality → fewer skipped iterations.
  const skipIters = Math.max(0, Math.min(30, Math.round(50 - quality / 3)))

  // ── Embedded palette (shared by every xform's colour bake) ────────────
  const paletteColors = parsePaletteColors(flameEl)

  // ── Parse transforms (xforms) ─────────────────────────────────────────

  const xformEls = flameEl.querySelectorAll('xform')
  if (xformEls.length === 0) {
    throw new Error('Invalid .flame: no <xform> elements found')
  }
  const transforms: Record<string, unknown> = {}
  const unmapped = new Set<string>()
  const approximated = new Set<string>()
  const ignoredFeatures = new Set<string>()

  for (const [index, xformEl] of [...xformEls].entries()) {
    const weight = parseFloatSafe(xformEl.getAttribute('weight'), 1)
    if (weight < 0) {
      throw new Error(
        `Invalid .flame: <xform> ${index + 1} has a negative weight`,
      )
    }
    const colorIndex = parseFloatSafe(xformEl.getAttribute('color'), 0)
    const opacity = parseFloatSafe(xformEl.getAttribute('opacity'), 1)
    // flam3 `color_speed` (newer) or `symmetry` (older: speed = (1−sym)/2).
    const colorSpeed =
      xformEl.getAttribute('color_speed') !== null
        ? parseFloatSafe(xformEl.getAttribute('color_speed'), 0.4)
        : xformEl.getAttribute('symmetry') !== null
          ? (1 - parseFloatSafe(xformEl.getAttribute('symmetry'), 0)) / 2
          : 0.4

    // flam3 `coefs` is the PRE-variation affine → chaos preAffine; the optional
    // `post` affine (applied after variations) → chaos postAffine.
    const preAffine = affineFromCoefs(
      parseNumberArray(xformEl.getAttribute('coefs'), 6),
    )
    const postAttr = xformEl.getAttribute('post')
    const postAffine =
      postAttr !== null
        ? affineFromCoefs(parseNumberArray(postAttr, 6))
        : { ...IDENTITY_AFFINE }

    // Colour: sample the embedded palette at this xform's colour index and bake
    // it as the transform's OkLab colour. With no palette, spread colours on the
    // OkLab unit circle by the colour index so transforms stay distinguishable.
    const color =
      paletteColors.length > 0
        ? (() => {
            const rgb = sampleGradient(paletteColors, colorIndex)
            const { a, b } = rgbToOklab(rgb.r, rgb.g, rgb.b)
            return { x: a, y: b }
          })()
        : {
            x: Math.cos(colorIndex * 2 * Math.PI) * 0.3,
            y: Math.sin(colorIndex * 2 * Math.PI) * 0.3,
          }

    // Variations (+ parametric params) from both the attribute and <var> forms.
    // NOTE: flam3 variation weights are additive blend amounts (a transform can
    // be linear=1 + spherical=1), NOT probabilities — they are NOT normalized.
    const variations = parseVariations(xformEl, unmapped, approximated)

    for (const attr of xformEl.attributes) {
      const name = attr.name.toLowerCase()
      if (
        UNSUPPORTED_XFORM_ATTRS.has(name) &&
        // A chaos vector's normal behavior is not an all-zero vector: zeroes
        // disable transitions. Its presence is meaningful even when every
        // token is 0, unlike scalar enable/amount controls.
        (name === 'chaos' || hasActiveNumericValue(attr.value))
      ) {
        ignoredFeatures.add(attr.name)
      }
    }

    const tid = generateTransformId('flam3')
    transforms[tid] = {
      probability: weight,
      colorSpeed,
      visible: opacity !== 0,
      preAffine,
      postAffine,
      color,
      variations,
    }
  }

  if (unmapped.size > 0) {
    warnings.push(
      `Skipped ${unmapped.size} variation(s) with no Lumen Apeiron equivalent: ${[...unmapped].join(', ')}`,
    )
  }
  if (approximated.size > 0) {
    warnings.push(
      `Approximated ${approximated.size} variation(s) with the nearest Lumen Apeiron equivalent: ${[...approximated].join(', ')}`,
    )
  }
  if (ignoredFeatures.size > 0) {
    warnings.push(
      `Ignored ${ignoredFeatures.size} unsupported xform feature(s): ${[...ignoredFeatures].join(', ')}`,
    )
  }

  // Normalize transform probabilities (flam3 xform weights are relative).
  const xformEntries = Object.entries(transforms) as [
    string,
    { probability: number },
  ][]
  const totalProb = xformEntries.reduce(
    (s, [, t]) => s + (t.probability || 0),
    0,
  )
  if (totalProb <= 0) {
    throw new Error(
      'Invalid .flame: transform weights must total more than zero',
    )
  }
  for (const [, t] of xformEntries) t.probability /= totalProb

  // ── Final transform ───────────────────────────────────────────────────
  // flam3 `<finalxform>` is applied to every point after the chosen xform.
  // chaos-master's finalTransform is a single affine (no variations), so we
  // fold the finalxform's pre (coefs) and post affines into one and warn if it
  // carries variations we can't represent.
  const finalEl = flameEl.querySelector('finalxform')
  let finalTransform: Record<string, number> | undefined
  if (finalEl) {
    const coefs = affineFromCoefs(
      parseNumberArray(finalEl.getAttribute('coefs'), 6),
    )
    const postAttr = finalEl.getAttribute('post')
    finalTransform =
      postAttr !== null
        ? composeAffine(affineFromCoefs(parseNumberArray(postAttr, 6)), coefs)
        : coefs
    if (hasNonLinearVariation(finalEl)) {
      warnings.push(
        'The <finalxform> has non-linear variations; only its affine was imported (Lumen Apeiron’s final transform is affine-only).',
      )
    }
  }

  // ── Build and validate ────────────────────────────────────────────────

  const descriptor = {
    version: '1.0',
    metadata: {
      name: name || 'Imported Flame',
      description: 'Imported from .flame file',
      author: 'flam3',
    },
    renderSettings: {
      dimensions: 2 as const,
      exposure,
      skipIters,
      backgroundColor: bgColor,
      gamma,
      vibrancy: 0.5,
      contrast: 1,
      highlightPower: 0.5,
      densityEstimationQuality: filter,
      estimatorCurve: 0.5,
      paletteMode: 0,
      palettePhase: 0,
      paletteSpeed: 0.5,
      camera: {
        zoom: Math.max(0.01, Math.abs(cameraZoom)),
        position: cameraPosition,
        rotation: 0,
      },
      drawMode: 'light' as const,
      colorInitMode: 'colorInitZero' as const,
      pointInitMode: 'pointInitUnitDisk' as const,
      depthColorPower: 0,
      lightDirection: [-0.5, 0.5, -1] as [number, number, number],
      lightPower: 0,
    },
    transforms,
    ...(finalTransform ? { finalTransform } : {}),
  }

  return { flame: validateFlame(descriptor), warnings }
}

/** One flame inside a possibly multi-flame XML document. A malformed entry is
 * retained as a result so batch tooling can audit the rest of the pack. */
export type FlameXmlDocumentEntry =
  | ({ index: number; name: string; ok: true } & FlameXmlReport)
  | { index: number; name: string; ok: false; error: string }

/**
 * Parse every `<flame>` in one XML document through the same importer used by
 * the UI. This is intentionally an orchestration layer: it neither registers
 * palettes nor writes imported flames anywhere.
 */
export function parseFlameXmlDocumentWithReport(
  xml: string,
): FlameXmlDocumentEntry[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Failed to parse .flame XML: ${parseError.textContent}`)
  }

  const flameEls = [...doc.querySelectorAll('flame')]
  if (flameEls.length === 0) {
    throw new Error('Invalid .flame file: no <flame> element found')
  }

  return flameEls.map((flameEl, index) => {
    const name = flameEl.getAttribute('name')?.trim() || `Flame ${index + 1}`
    try {
      return {
        index,
        name,
        ok: true as const,
        ...parseFlameElementWithReport(flameEl),
      }
    } catch (error) {
      return {
        index,
        name,
        ok: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
}

export function parseFlameXmlWithReport(xml: string): FlameXmlReport {
  const first = parseFlameXmlDocumentWithReport(xml)[0]!
  if (!first.ok) throw new Error(first.error)
  return { flame: first.flame, warnings: first.warnings }
}

/**
 * Parse a .flame XML string into a chaos-master FlameDescriptor, logging any
 * non-fatal warnings to the console. Use {@link parseFlameXmlWithReport} when
 * you want to surface those warnings in the UI.
 */
export function parseFlameXml(xml: string): FlameDescriptor {
  const { flame, warnings } = parseFlameXmlWithReport(xml)
  for (const w of warnings) console.warn(`[flameXml] ${w}`)
  return flame
}

// ── Detector ───────────────────────────────────────────────────────────────

/**
 * Detect if a string is likely a .flame XML file.
 * Checks for the `<flame` opening tag within the first 1000 characters.
 */
export function isFlameXmlContent(content: string): boolean {
  const head = content.slice(0, 1000)
  return /<flame\b/i.test(head)
}

// ── Palette extraction / library registration ────────────────────────────────

/** Build N evenly-spaced OkLab gradient stops from a flam3 RGB colour list. */
function gradientToEntries(colors: Rgb[], numStops = 16): PaletteEntry[] {
  const entries: PaletteEntry[] = []
  for (let i = 0; i < numStops; i++) {
    const position = i / (numStops - 1)
    const rgb = sampleGradient(colors, position)
    const { a, b } = rgbToOklab(rgb.r, rgb.g, rgb.b)
    entries.push(paletteEntry(position, a, b))
  }
  return entries
}

/** Stable content hash over a palette's stops, so re-importing the same gradient
 *  doesn't pile up duplicate custom palettes. */
function hashEntries(entries: PaletteEntry[]): string {
  let h = 0x811c9dc5
  for (const e of entries) {
    const s = `${e.position.toFixed(3)}:${e.a.toFixed(3)}:${e.b.toFixed(3)}`
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  return (h >>> 0).toString(16)
}

/**
 * Extract the embedded palette from a .flame XML string as a Palette, or
 * `undefined` if the file carries no usable gradient.
 */
export function extractFlamePalette(xml: string): Palette | undefined {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const flameEl = doc.querySelector('flame')
  if (!flameEl) return undefined
  const colors = parsePaletteColors(flameEl)
  if (colors.length === 0) return undefined

  const entries = gradientToEntries(colors)
  const name = flameEl.getAttribute('name')
  return {
    id: `imported-${hashEntries(entries)}`,
    name: name !== null && name !== '' ? `${name} palette` : 'Imported palette',
    entries,
    source: 'imported',
  }
}

/**
 * Register a .flame file's embedded palette in the user's custom palette
 * library, de-duplicated by content so re-importing the same flame doesn't add
 * the gradient twice. Returns the matched or newly-created palette (or
 * `undefined` if the file has no palette).
 */
export function registerImportedFlamePalette(xml: string): Palette | undefined {
  const palette = extractFlamePalette(xml)
  if (!palette) return undefined

  const hash = hashEntries(palette.entries)
  const existing = loadCustomPalettes().find(
    (p) => hashEntries(p.entries) === hash,
  )
  if (existing) return existing

  return addCustomPalette({
    name: palette.name,
    entries: palette.entries,
    source: 'imported',
  })
}

// ── Exporter ───────────────────────────────────────────────────────────────

function affineIsIdentity(a: Record<string, number>): boolean {
  return (
    a.a === 1 && a.b === 0 && a.c === 0 && a.d === 0 && a.e === 1 && a.f === 0
  )
}

/** Serialize a chaos-master affine back to a flam3 `coefs` string
 *  (`c00 c01 c10 c11 c20 c21`). Inverse of {@link affineFromCoefs}. */
function coefsFromAffine(a: Record<string, number>): string {
  const c00 = a.a ?? 1
  const c01 = a.d ?? 0
  const c10 = a.b ?? 0
  const c11 = a.e ?? 1
  const c20 = a.c ?? 0
  const c21 = a.f ?? 0
  return [c00, c01, c10, c11, c20, c21].map((n) => n.toFixed(6)).join(' ')
}

/**
 * Export a FlameDescriptor to .flame XML format (Apophysis/flam3 compatible).
 *
 * Custom (user-authored WGSL/math) variations are omitted — the .flame format
 * has no way to represent them and other tools couldn't render them. A transform
 * whose only variations were custom is exported as plain linear. Callers can use
 * collectFlameCustomVariations to tell the user when something was dropped.
 */
export function exportFlameXml(flame: FlameDescriptor, name?: string): string {
  const dims = flame.renderSettings.dimensions ?? 2
  if (dims !== 2) {
    throw new Error('flame XML export only supports 2D flames')
  }

  const cam = flame.renderSettings.camera
  const maxDim = 800 // default flam3 size
  const half = maxDim / 2
  const scale = (cam.zoom ?? 1) * half
  const center = {
    x: -(cam.position?.[0] ?? 0) * half,
    y: -(cam.position?.[1] ?? 0) * half,
  }

  const brightness = Math.max(
    1,
    Math.round(Math.pow(2, (flame.renderSettings.exposure ?? 0.25) / 1.5)),
  )
  const quality = Math.round(50 - (flame.renderSettings.skipIters ?? 20) * 3)
  // flam3 background is 0–255.
  const bg = (flame.renderSettings.backgroundColor ?? [0, 0, 0])
    .map((v) => Math.round(v * 255))
    .join(' ')

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<flame name="${escapeXml(name ?? flame.metadata?.name ?? 'Untitled')}"`
  xml += ` version="chaos-master" size="${maxDim} ${Math.round((maxDim * 9) / 16)}"`
  xml += ` center="${center.x.toFixed(3)} ${center.y.toFixed(3)}"`
  xml += ` scale="${scale.toFixed(3)}"`
  xml += ` oversample="1"`
  xml += ` filter="${(flame.renderSettings.densityEstimationQuality ?? 0.5).toFixed(3)}"`
  xml += ` quality="${quality}"`
  xml += ` background="${bg}"`
  xml += ` brightness="${brightness}"`
  xml += ` gamma="${(flame.renderSettings.gamma ?? 2.2).toFixed(1)}"`
  xml += '>\n'

  for (const [, t] of Object.entries(flame.transforms)) {
    const xform = t as Record<string, unknown>
    const prob = (xform.probability as number) ?? 1
    const pre = (xform.preAffine as Record<string, number>) ?? {
      ...IDENTITY_AFFINE,
    }
    const post = (xform.postAffine as Record<string, number> | undefined) ?? {
      ...IDENTITY_AFFINE,
    }
    const col = (xform.color as { x: number; y: number }) ?? { x: 0, y: 0 }
    const vars = (xform.variations ?? {}) as Record<
      string,
      { type: string; weight: number; params?: Record<string, number> }
    >

    // Recover a flam3 colour index from the OkLab colour angle.
    const colorIndex = (Math.atan2(col.y, col.x) / (2 * Math.PI) + 1) % 1

    xml += '  <xform'
    xml += ` weight="${prob.toFixed(6)}"`
    xml += ` color="${colorIndex.toFixed(6)}"`
    // flam3 stores variations + their params as xform attributes (the
    // round-trippable, Apophysis-native form). Custom (user-authored WGSL/math)
    // variations are dropped here — they have no flam3/Apophysis equivalent — so
    // a transform left with none falls back to plain linear to stay a valid xform.
    const attrs = variationAttrs(vars)
    xml += attrs === '' ? ' linear="1"' : attrs
    // chaos preAffine is the pre-variation affine → flam3 `coefs`.
    xml += ` coefs="${coefsFromAffine(pre)}"`
    if (!affineIsIdentity(post)) {
      xml += ` post="${coefsFromAffine(post)}"`
    }
    xml += '/>\n'
  }

  // chaos finalTransform (an affine) → flam3 `<finalxform>` (linear + coefs).
  if (flame.finalTransform && !affineIsIdentity(flame.finalTransform)) {
    xml += `  <finalxform color="0" linear="1" coefs="${coefsFromAffine(flame.finalTransform)}"/>\n`
  }

  xml += '</flame>\n'
  return xml
}

/** Serialize a transform's variations to flam3 xform attributes —
 *  `linear="1" julian="0.5" julian_power="3"` — params included.
 *
 *  Custom variations (ids prefixed `custom_`) are skipped: they're arbitrary
 *  user WGSL/math with no flam3 or Apophysis counterpart, so writing their name
 *  would produce a `.flame` that no other tool can render. They're dropped
 *  silently here; the export caller surfaces a note to the user. */
function variationAttrs(
  vars: Record<
    string,
    { type: string; weight: number; params?: Record<string, number> }
  >,
): string {
  let out = ''
  for (const [, vrec] of Object.entries(vars)) {
    if (vrec.type.startsWith('custom_')) continue
    const flam3Name = chaosTypeToFlam3Name(vrec.type)
    out += ` ${flam3Name}="${vrec.weight.toFixed(6)}"`
    if (vrec.params) {
      for (const [key, value] of Object.entries(vrec.params)) {
        // Guard against NaN/Infinity params (e.g. from a bad randomize/edit)
        // producing invalid XML like `julian_power="NaN"` that fails re-import.
        const safeValue = Number.isFinite(value) ? value : 0
        out += ` ${flam3Name}_${key}="${safeValue.toFixed(6)}"`
      }
    }
  }
  return out
}

/** Map a chaos-master variation type back to its flam3 name for export:
 *  drop the `Var` suffix, snake_case the leading `pre`/`post` qualifier, and
 *  lowercase — `preBlur` → `pre_blur`, `pieVar` → `pie`. */
function chaosTypeToFlam3Name(type: string): string {
  const base = type.replace(/Var$/, '')
  const snake = base.replace(
    /^(pre|post)([A-Z])/,
    (_m, q: string, c: string) => `${q}_${c.toLowerCase()}`,
  )
  return snake.toLowerCase()
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
