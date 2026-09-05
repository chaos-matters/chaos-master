import { MAX_SHORTEN_PAYLOAD, SHORTEN_TTL } from '../types'
import { errMsg, generateShortId, json } from '../utils'
import type { Env } from '../types'

/**
 * Create a short link (POST /api/shorten).
 */
export async function handleShortenPost(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const { payload } = (await request.json()) as { payload?: unknown }
    if (typeof payload !== 'string' || payload.length === 0) {
      return json({ error: 'Invalid payload' }, 400)
    }
    // Bound the stored value checking the parsed string length, not the spoofable content-length header.
    if (payload.length > MAX_SHORTEN_PAYLOAD) {
      return json({ error: 'Payload too large' }, 413)
    }
    const shortId = generateShortId()
    await env.KV_SHORTENER.put(shortId, payload, {
      expirationTtl: SHORTEN_TTL,
    })
    return json({ id: shortId })
  } catch (err) {
    console.error('Error handling /api/shorten POST:', errMsg(err))
    return json({ error: 'Bad request' }, 400)
  }
}

/**
 * Resolve a short link's payload (GET /api/shorten/:id).
 */
export async function handleShortenGet(
  pathname: string,
  env: Env,
): Promise<Response> {
  const shortId = pathname.split('/').pop()
  if (!shortId) return json({ error: 'Missing ID' }, 400)
  try {
    const payload = await env.KV_SHORTENER.get(shortId)
    if (!payload) return json({ error: 'Not found' }, 404)
    return json({ payload })
  } catch (err) {
    console.error('Error handling /api/shorten GET:', errMsg(err))
    return json({ error: 'Server error' }, 500)
  }
}
