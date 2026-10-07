import { TURNSTILE_VERIFY_URL } from '../types'
import { errMsg } from '../utils'

/**
 * Verify a Cloudflare Turnstile token server-side. Returns `true` only on an
 * explicit `success`. Reusable for any bot-gated endpoint (e.g. sign-in).
 */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
  allowedHostnames?: string[],
): Promise<boolean> {
  if (!token) return false
  try {
    const form = new FormData()
    form.append('secret', secret)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: form,
    })
    const data = (await res.json()) as { success?: boolean; hostname?: string }
    if (data.success !== true) return false
    // Pin the origin the token was solved on (when an allowlist is configured),
    // so a token obtained on one allowed host can't be replayed against another.
    if (allowedHostnames && allowedHostnames.length > 0) {
      if (!data.hostname || !allowedHostnames.includes(data.hostname)) {
        console.warn('Turnstile hostname rejected:', data.hostname)
        return false
      }
    }
    return true
  } catch (err) {
    console.error('Turnstile verify failed:', errMsg(err))
    return false
  }
}
