/**
 * Minimal Cloudflare Turnstile helper.
 *
 * The site key is public and read from `VITE_TURNSTILE_SITE_KEY` at build time.
 * When it's unset (local dev without keys) the widget is skipped entirely and
 * callers fall back to sharing without a token — the Worker only enforces
 * verification when its `TURNSTILE_SECRET` is configured, so the two stay in
 * step. Use Cloudflare's test keys for local enforcement testing.
 */

export const TURNSTILE_SITE_KEY: string | undefined =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined

const SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string
      callback: (token: string) => void
      'expired-callback'?: () => void
      'error-callback'?: () => void
      'timeout-callback'?: () => void
      theme?: 'auto' | 'light' | 'dark'
      size?: 'normal' | 'flexible' | 'compact'
    },
  ) => string
  reset: (widgetId?: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | undefined

/** Inject the Turnstile script once and resolve when `window.turnstile` is ready. */
export function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    )
    const script = existing ?? document.createElement('script')
    const onReady = () => {
      // The API may attach a tick after load — poll briefly.
      const start = Date.now()
      const check = () => {
        if (window.turnstile) {
          resolve()
        } else if (Date.now() - start > 5000) {
          reject(new Error('Turnstile failed to initialise'))
        } else {
          setTimeout(check, 50)
        }
      }
      check()
    }
    script.addEventListener('error', () => {
      reject(new Error('Failed to load Turnstile script'))
    })
    if (existing) {
      onReady()
    } else {
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.addEventListener('load', onReady)
      document.head.appendChild(script)
    }
  })
  return scriptPromise
}
