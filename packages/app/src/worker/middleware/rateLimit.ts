import { DISCORD_DAILY_CAP } from '../types'
import { errMsg, json } from '../utils'
import type { Env } from '../types'

/**
 * Rate-limit the write endpoints per IP.
 * Bounds spam/abuse (and R2/KV cost). Fail-open: a limiter hiccup or a
 * missing binding never breaks sharing.
 */
export async function checkApiRateLimit(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (request.method === 'POST' && url.pathname.startsWith('/api/')) {
    try {
      const ip = request.headers.get('cf-connecting-ip') ?? 'anon'
      const { success } = await env.API_RL.limit({ key: ip })
      if (!success) {
        return json({ error: 'Too many requests, please slow down' }, 429)
      }
    } catch (err) {
      console.error('Rate limit check failed (allowing):', errMsg(err))
    }
  }
  return null
}

/**
 * Stricter per-IP burst limit dedicated to Discord share.
 */
export async function checkDiscordRateLimit(
  ip: string,
  env: Env,
): Promise<Response | null> {
  try {
    const { success } = await env.DISCORD_RL.limit({ key: ip })
    if (!success) {
      return json({ error: 'Too many requests, please slow down' }, 429)
    }
  } catch (err) {
    console.error('Discord rate limit check failed (allowing):', errMsg(err))
  }
  return null
}

/**
 * Per-IP daily cap via KV (counts attempts, so a broken webhook can't be
 * used to hammer the endpoint). Fail-open on KV hiccups.
 */
export async function checkDiscordDailyCap(
  ip: string,
  env: Env,
): Promise<Response | null> {
  try {
    const day = new Date().toISOString().slice(0, 10)
    const capKey = `dshare:${ip}:${day}`
    const used = Number((await env.KV_SHORTENER.get(capKey)) ?? 0)
    if (used >= DISCORD_DAILY_CAP) {
      return json({ error: 'Daily share limit reached' }, 429)
    }
    await env.KV_SHORTENER.put(capKey, String(used + 1), {
      expirationTtl: 24 * 60 * 60,
    })
  } catch (err) {
    console.error('Discord daily cap check failed (allowing):', errMsg(err))
  }
  return null
}
