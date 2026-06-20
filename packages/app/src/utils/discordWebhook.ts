import { blobToBase64 } from '@/utils/blob'
import type { DiscordShareMeta } from '@/components/DiscordShareModal/DiscordShareModal'

/**
 * Share a flame PNG to the project Discord via the Worker endpoint
 * (`POST /api/share-discord`). The real webhook URL lives as a Worker secret —
 * never in the client bundle — and the Worker verifies the Turnstile `token`,
 * rate-limits per IP, then forwards the image to Discord.
 *
 * `token` is the Cloudflare Turnstile response from the share modal (may be an
 * empty string in local dev when no site key is configured).
 *
 * Returns `true` on success, `false` on failure (bot-check rejected,
 * rate-limited, webhook unconfigured, or network error).
 */
export async function sendFlameToDiscord(
  blob: Blob,
  meta: DiscordShareMeta,
  token: string,
): Promise<boolean> {
  // Bound the request so a hanging / unreachable endpoint (e.g. no Worker
  // running locally) fails into the manual fallback instead of spinning forever.
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, 20000)
  try {
    const image = await blobToBase64(blob)
    const res = await fetch('/api/share-discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image,
        title: meta.title,
        author: meta.author,
        token,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return false
    const body = (await res.json().catch(() => null)) as { ok?: boolean } | null
    return body?.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
