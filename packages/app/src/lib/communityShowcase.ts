import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

/** Bump only when the public consent copy or permitted use changes materially. */
export const SHOWCASE_CONSENT_VERSION = 'home-showcase-v1'

export type CommunityShowcaseStatus = 'not-requested' | 'queued' | 'unavailable'

/**
 * The optional, explicitly consented addition to a normal Discord share.
 *
 * The Worker treats every field as untrusted and validates it again. Keeping
 * this type shared only prevents the first-party client and endpoint from
 * drifting; it is not an authorization boundary.
 */
export interface CommunityShowcaseRequest {
  consent: true
  consentVersion: typeof SHOWCASE_CONSENT_VERSION
  flame: FlameDescriptor
  animation?: {
    tracks: TimelineTrack[]
    config: TimelineConfig
  }
  shareUrl: string
}

export interface DiscordShareResult {
  shared: true
  showcaseRequested: boolean
  showcaseQueued: boolean
}
