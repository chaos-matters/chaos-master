import type { CommunityShowcaseRequest, CommunityShowcaseStatus, } from '@/lib/communityShowcase'

/**
 * Minimal typed client for the Worker's share endpoints.
 *
 * Centralises the transport concerns that were duplicated across the share
 * utilities — JSON encoding, an AbortController timeout, and uniform error
 * handling — so call sites stay declarative and are trivially mockable in tests
 * (stub `ShareApi`). `postJson` returns `null` on a non-OK response, a network
 * error, or a timeout; callers decide what that means for them.
 */
async function postJson<TRes>(
  path: string,
  body: unknown,
  timeoutMs = 20_000,
): Promise<TRes | null> {
  const controller = new AbortController()
  // Bound the request so a hanging / unreachable endpoint (e.g. no Worker
  // running locally) fails into the caller's fallback instead of spinning.
  const timer = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as TRes
  } catch (err) {
    console.error(`POST ${path} failed:`, err)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** The Worker share endpoints, typed. Each returns `null` on failure. */
export const ShareApi = {
  shorten: (payload: string) =>
    postJson<{ id?: string }>('/api/shorten', { payload }),

  uploadOg: (
    key: string,
    body: { image: string; title: string; description: string },
  ) => postJson<{ ok?: boolean }>(`/api/og/${key}`, body),

  shareDiscord: (body: {
    image: string
    title?: string
    author: string
    token: string
    showcase?: CommunityShowcaseRequest
  }) =>
    postJson<{ ok?: boolean; showcase?: CommunityShowcaseStatus }>(
      '/api/share-discord',
      body,
    ),
} as const
