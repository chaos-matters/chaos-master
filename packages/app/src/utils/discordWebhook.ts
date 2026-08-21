import { ShareApi } from '@/utils/apiClient'
import { blobToBase64 } from '@/utils/blob'
import type { DiscordShareMeta } from '@/components/DiscordShareModal/DiscordShareModal'
import type { CommunityShowcaseRequest, DiscordShareResult, } from '@/lib/communityShowcase'

/**
 * Share a flame PNG to the project Discord via the Worker endpoint
 * (`POST /api/share-discord`). The real webhook URL lives as a Worker secret —
 * never in the client bundle — and the Worker verifies the Turnstile `token`,
 * rate-limits per IP, then forwards the image to Discord.
 *
 * `token` is the Cloudflare Turnstile response from the share modal (may be an
 * empty string in local dev when no site key is configured).
 *
 * Returns the successful Discord/showcase outcome, or `undefined` on failure
 * (bot-check rejected, rate-limited, webhook unconfigured, or network error).
 */
export async function sendFlameToDiscord(
  blob: Blob,
  meta: DiscordShareMeta,
  token: string,
  showcase?: CommunityShowcaseRequest,
): Promise<DiscordShareResult | undefined> {
  // Transport (incl. the 20s timeout that lets a hanging endpoint fall back to
  // manual sharing) lives in ShareApi/postJson now.
  try {
    const image = await blobToBase64(blob)
    const res = await ShareApi.shareDiscord({
      image,
      title: meta.title,
      author: meta.author,
      token,
      showcase,
    })
    if (res?.ok !== true) return undefined
    return {
      shared: true,
      showcaseRequested: showcase !== undefined,
      showcaseQueued: res.showcase === 'queued',
    }
  } catch {
    return undefined
  }
}
