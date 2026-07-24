// Telemetry & GA4 Analytics helper for Lumen Apeiron (packages/app)

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const gaId = import.meta.env.VITE_GA_ID as string | undefined

export function initTelemetry(): void {
  if (!gaId || typeof window === 'undefined') return

  if (!document.getElementById('ga4-script')) {
    const script = document.createElement('script')
    script.id = 'ga4-script'
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
    document.head.appendChild(script)

    window.dataLayer = window.dataLayer || []
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments)
    }
    window.gtag('js', new Date())
    window.gtag('config', gaId, { send_page_view: true })
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, params)
  }
}

export function trackAppInit(webgpuSupported: boolean): void {
  trackEvent('app_init', {
    webgpu_supported: webgpuSupported,
  })
}

export function trackFlameShortened(): void {
  trackEvent('flame_shortened')
}

export function trackOgPreviewGenerated(): void {
  trackEvent('og_preview_generated')
}

export function trackDiscordShare(): void {
  trackEvent('flame_shared_discord')
}
