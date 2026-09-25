/**
 * How hard the clash preview drives the GPU, by the hardware tier the app
 * detected on this device (stored by the welcome screen). A bout changes
 * every frame, so each frame starts its image from nothing: a weaker GPU gets
 * a smaller canvas rather than a grainier one. Without a stored tier, a touch
 * screen is taken for a phone.
 */
import type { HardwareTier } from '@/utils/hardwareTier'

export type ClashQuality = { renderScale: number; pointCountPerBatch: number }

const BY_TIER: Record<HardwareTier, ClashQuality> = {
  ultra: { renderScale: 1, pointCountPerBatch: 1e6 },
  high: { renderScale: 1, pointCountPerBatch: 1e6 },
  mid: { renderScale: 0.75, pointCountPerBatch: 5e5 },
  low: { renderScale: 0.5, pointCountPerBatch: 2.5e5 },
}

export function clashQuality(
  tier: HardwareTier | null | undefined,
  coarsePointer: boolean,
): ClashQuality {
  if (tier && Object.hasOwn(BY_TIER, tier)) return BY_TIER[tier]
  return BY_TIER[coarsePointer ? 'mid' : 'high']
}
