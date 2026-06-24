import { produce } from 'structurajs'
import { example1 } from '@/flame/examples/example1'
import { example29 } from '@/flame/examples/example29'
import { example33 } from '@/flame/examples/example33'
import { example40 } from '@/flame/examples/example40'
import { example44 } from '@/flame/examples/example44'
import { example45 } from '@/flame/examples/example45'
import { example46 } from '@/flame/examples/example46'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** The app's origin — where `?flame=` links open. */
export const APP_URL = 'https://chaos-master.com'

/**
 * A landing-only override layered on top of an app example WITHOUT forking it —
 * supply only the props that differ (render settings, a final transform, metadata)
 * and {@link overrideFlame} merges them onto a clone of the original. Keeps the
 * shared `packages/app` example spec untouched while letting the landing tune
 * exposure / camera / etc. per surface.
 */
export type FlameOverride = {
  renderSettings?: Partial<FlameDescriptor['renderSettings']>
  finalTransform?: FlameDescriptor['finalTransform']
  metadata?: Partial<NonNullable<FlameDescriptor['metadata']>>
}

/** Merge an {@link FlameOverride} onto `base`, returning a new flame. Uses the
 *  app's immutable-edit idiom (`produce` from structurajs — works on the frozen
 *  example specs; no `unfreeze` needed since the landing only reads the result).
 *  `renderSettings` merges shallowly except `camera`/`camera3D`, which deep-merge
 *  so you can override a single field (e.g. just `camera3D.radius`). */
export function overrideFlame(
  base: FlameDescriptor,
  o: FlameOverride,
): FlameDescriptor {
  return produce(base, (draft) => {
    if (o.renderSettings) {
      const { camera, camera3D, ...rest } = o.renderSettings
      Object.assign(draft.renderSettings, rest)
      if (camera) Object.assign(draft.renderSettings.camera, camera)
      if (camera3D) Object.assign(draft.renderSettings.camera3D, camera3D)
    }
    if (o.finalTransform !== undefined) draft.finalTransform = o.finalTransform
    if (o.metadata) Object.assign(draft.metadata, o.metadata)
  })
}

/**
 * Landing render of the Enchanted Rose (example44) at high density-estimation
 * quality. The shared app example uses 0.6, which converges slowly / blurs during
 * movement; bump it here (landing-only) so it's crisp immediately like the earth.
 */
export const ROSE_LANDING: FlameDescriptor = overrideFlame(example44, {
  renderSettings: { densityEstimationQuality: 1, estimatorCurve: 0.85 },
})

/**
 * Landing render of the Nautilus Shell (example40) — user-tuned exposure /
 * grade / camera framing + a final transform, layered on the app example.
 */
export const NAUTILUS_LANDING: FlameDescriptor = overrideFlame(example40, {
  renderSettings: {
    exposure: -4.333,
    skipIters: 30,
    plotsPerChain: 16,
    autoExposure3D: false,
    autoExposure3DStrength: 1,
    autoExposure3DRefRadius: 1.2940127090119309,
    autoExposure3DBase: -2.832,
    vibrancy: 0.9,
    contrast: 2.65,
    gamma: 4.38,
    depthColorPower: 0.3,
    lightPower: 0.09,
    densityEstimationQuality: 1,
    estimatorCurve: 0.1,
    camera: { zoom: 1, position: [0, 0], rotation: 0 },
    camera3D: {
      theta: 2.460917968749997,
      phi: 1.4938085937500014,
      radius: 0.8691350274605435,
      target: [0, 0, 0],
      fov: 55,
      roll: 0,
    },
  },
  finalTransform: {
    a: 1,
    b: 0,
    c: 0,
    d: -0.3656628131866455,
    e: 0,
    f: 1,
    g: 0,
    h: 0.05329771339893341,
    i: 0,
    j: 0,
    k: 1,
    l: 0,
  },
})

/**
 * Landing render of 3D Shells (example33) — user-tuned exposure / lighting +
 * a camera3D framing (the app example defines no camera3D), layered on top.
 */
export const SHELLS_LANDING: FlameDescriptor = overrideFlame(example33, {
  renderSettings: {
    exposure: -3.392,
    plotsPerChain: 16,
    autoExposure3D: false,
    autoExposure3DStrength: 1,
    autoExposure3DRefRadius: 5,
    autoExposure3DBase: 0,
    depthColorPower: 0,
    lightDirection: [-0.5, 0.5, -1],
    lightPower: 0,
    camera: { zoom: 1, position: [0, 0], rotation: 0 },
    camera3D: {
      theta: 2.6914843750000004,
      phi: 1.3482572642948953,
      radius: 4.928000000000001,
      target: [0, 0, 0],
      fov: 60,
      roll: 0,
    },
  },
})

/** Static-poster path for a named landing flame (see `public/posters/`). */
export function posterFor(name: string): string {
  return `/posters/${name}.jpg`
}

// ── Landing render config — tune here, no magic numbers at the call sites ─────

/** Quality target (0..1) for the prominent / interactive flames: hero, studio,
 *  community cards, Explore modal, and a hovered gallery plate. Higher = crisper
 *  converged image, but more points needed to get there. */
export const PREVIEW_QUALITY = 0.99
/** Quality for idle (not-hovered) gallery thumbnails — a touch lower to ease GPU
 *  load when you're not looking at them. */
export const PREVIEW_QUALITY_IDLE = 0.97

/** Per-flame point budget ({@link devicePointBudget}) for the mobile / low tier. */
export const POINT_BUDGET_MOBILE = 1e5
/** Per-flame point budget for the desktop / high tier (the app's value). */
export const POINT_BUDGET_DESKTOP = 1e6

let cachedBudget: number | undefined
/**
 * Per-flame chaos-game point budget (`pointCountPerBatch`) by a coarse device
 * tier. This is the dominant knob for motion smoothness: it's the number of
 * parallel chains in one GPU dispatch, so a bigger value saturates the GPU in one
 * shot (smooth) instead of many tiny dispatches whose per-dispatch overhead
 * starves Firefox / mobile (grainy). It also sizes per-flame point-state buffers
 * (~32 bytes × budget), so it trades VRAM against smoothness.
 *
 * Interim heuristic until the offscreen HW-tier benchmark lands (see assets/local
 * backlog) — that will let high-end machines push higher (e.g. 1e7) for a single
 * live flame.
 */
export function devicePointBudget(): number {
  if (cachedBudget !== undefined) return cachedBudget
  // Tier on TOUCH, not screen size: a big tablet reports a desktop-sized screen
  // but has a mobile-class GPU, so ANY touch device gets the mobile budget; only a
  // no-touch device gets the desktop budget.
  const touch = (globalThis.navigator?.maxTouchPoints ?? 0) > 0
  cachedBudget = touch ? POINT_BUDGET_MOBILE : POINT_BUDGET_DESKTOP
  return cachedBudget
}

/** A small override applied on top of a base flame: per-transform color (OkLab
 *  a/b) and/or probability (by transform index), and a renderSettings merge.
 *  Used to derive showcase variants (e.g. Earth Flame palettes) and to preview
 *  tuning candidates without forking the base example. */
export type FlameRecipe = {
  transforms?: Array<{ color?: [number, number]; probability?: number }>
  render?: Partial<FlameDescriptor['renderSettings']>
}

/** Clone `base` and apply a {@link FlameRecipe}. Transform overrides are indexed
 *  by position; out-of-range entries are ignored. */
export function applyFlameRecipe(
  base: FlameDescriptor,
  recipe: FlameRecipe,
): FlameDescriptor {
  const clone = structuredClone(base)
  if (recipe.render) {
    clone.renderSettings = { ...clone.renderSettings, ...recipe.render }
  }
  if (recipe.transforms) {
    const keys = Object.keys(clone.transforms)
    recipe.transforms.forEach((ov, i) => {
      const t = clone.transforms[keys[i]]
      if (!t) return
      if (ov.color) t.color = { x: ov.color[0], y: ov.color[1] }
      if (ov.probability !== undefined) t.probability = ov.probability
    })
  }
  return clone
}

/**
 * Landing render of First Light (example1) — shifted left + zoomed out so the
 * flame fills the wide gallery plate (no empty space on the left) and its top
 * isn't clipped. Camera-only override; the shared app example is untouched.
 */
export const EXAMPLE1_LANDING: FlameDescriptor = overrideFlame(example1, {
  renderSettings: {
    camera: {
      zoom: 0.72,
      position: [0.5652259588241577, 0.16019338369369507],
      rotation: 0,
    },
  },
})

/**
 * Single source of truth for every flame that appears live on the landing, keyed
 * by poster name. Gallery plates + community cards reference these by name; the
 * `poster-capture` page renders each one to `public/posters/<name>.jpg` so the
 * static fallback always matches the live flame exactly.
 */
export const LANDING_FLAMES = {
  example1: EXAMPLE1_LANDING,
  example29,
  example33: SHELLS_LANDING,
  example40: NAUTILUS_LANDING,
  example45,
  rose: ROSE_LANDING,
  earth: example46,
} satisfies Record<string, FlameDescriptor>

/** Prettify a variation type literal: `sinusoidalVar` → `SINUSOIDAL`,
 *  `julia3D` → `JULIA 3D`. */
export function prettyVariation(type: string): string {
  return type
    .replace(/Var$/, '')
    .replace(/3D$/, ' 3D')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toUpperCase()
}

/** Distinct variation types behind a flame, prettified —
 *  e.g. "SWIRL · SINUSOIDAL · SPHERICAL". */
export function variationSummary(flame: FlameDescriptor, max = 4): string {
  const types = new Set<string>()
  for (const t of Object.values(flame.transforms)) {
    for (const v of Object.values(t.variations)) {
      types.add(prettyVariation(v.type))
    }
  }
  return [...types].slice(0, max).join(' · ')
}
