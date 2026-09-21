/**
 * Quality while gliding, in tiers.
 *
 * Accumulation restarts on every glide frame — the flame really is a different
 * flame each frame — so a glide costs a full convergence per frame at full
 * quality. The eye does not resolve detail in motion and the settled frame is
 * the one people screenshot, so the intermediates are rendered at a fraction
 * of the target quality and the settle at all of it.
 *
 * Tiers rather than one constant because the right fraction is a property of
 * the GPU in the machine, not of the feature: `responsive` keeps a glide
 * fluid on a modest card, `full` refuses to downshift at all and simply takes
 * longer per frame. `auto` derives the tier from the workspace's own quality
 * preset, so someone already running at `ultra` gets the slower, prettier
 * glide without configuring anything.
 */

import type { GlideQuality, GlideQualityPreference, GlideQualityTier, } from './types'

export const GLIDE_QUALITY_TIERS: Record<
  GlideQualityTier,
  { accumulationScale: number; durationScale: number; label: string }
> = {
  responsive: {
    accumulationScale: 0.35,
    durationScale: 1,
    label: 'Responsive',
  },
  balanced: { accumulationScale: 0.6, durationScale: 1.25, label: 'Balanced' },
  full: { accumulationScale: 1, durationScale: 1.5, label: 'Full' },
}

export const GLIDE_QUALITY_TIER_KEYS = [
  'responsive',
  'balanced',
  'full',
] as const

/** The default fraction for export intermediates — the `responsive` tier. */
export const GLIDE_QUALITY_SCALE =
  GLIDE_QUALITY_TIERS.responsive.accumulationScale

export function isGlideQualityTier(value: unknown): value is GlideQualityTier {
  return (
    typeof value === 'string' &&
    (GLIDE_QUALITY_TIER_KEYS as readonly string[]).includes(value)
  )
}

export function isGlideQualityPreference(
  value: unknown,
): value is GlideQualityPreference {
  return value === 'auto' || isGlideQualityTier(value)
}

/**
 * A quality preset key from `components/Quality/QualityPresets` mapped onto a
 * tier. Taken as a plain string so this file stays free of app imports.
 */
export function glideTierForQualityPreset(
  preset: string | undefined,
): GlideQualityTier {
  switch (preset) {
    case 'ultra':
      return 'full'
    case 'high':
      return 'balanced'
    default:
      return 'responsive'
  }
}

export function resolveGlideQuality(
  preference: GlideQualityPreference | undefined,
  qualityPreset?: string,
): GlideQuality {
  const tier =
    preference === undefined || preference === 'auto'
      ? glideTierForQualityPreset(qualityPreset)
      : preference
  const entry = GLIDE_QUALITY_TIERS[tier]
  return {
    tier,
    accumulationScale: entry.accumulationScale,
    durationScale: entry.durationScale,
  }
}

/**
 * The quality to render one glide frame at.
 *
 * `t >= 1` is the settle, and the settle is always full quality — that rule
 * holds in every tier, including `responsive`, because the frame a viewer
 * stops on must not be the noisy one.
 */
export function glideFrameQuality(
  targetQuality: number,
  quality: GlideQuality,
  t: number,
): number {
  if (t >= 1) return targetQuality
  return targetQuality * quality.accumulationScale
}
