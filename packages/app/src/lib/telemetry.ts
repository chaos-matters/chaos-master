// Telemetry & GA4 Analytics helper for Lumen Apeiron (packages/app)

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

const gaId = import.meta.env.VITE_GA_ID as string | undefined

/**
 * Local development is not a data source — it would mix developer sessions
 * into the same property as real traffic. Deployed environments (including
 * dev.lumenapeiron.com, which is built with `--mode development`) still
 * report, so the funnel can be validated before it goes to production;
 * separate them in GA by hostname.
 */
function isLocalhost(): boolean {
  const { hostname } = window.location
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  )
}

export function initTelemetry(): void {
  if (!gaId || typeof window === 'undefined') return
  if (isLocalhost()) return

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
    // Report the page WITHOUT its query string. Share links carry user content
    // and capability tokens in the URL — `?flame=` (the encoded flame +
    // timeline), `?cv=` (user-authored WGSL) and `?s=` (the short id that
    // resolves to a stored payload). GA4's default page_location is the full
    // href, which would hand all of that to Google and let anyone with
    // property access reopen every shared flame.
    const cleanLocation = `${window.location.origin}${window.location.pathname}`

    window.gtag('js', new Date())
    window.gtag('config', gaId, {
      // Suppress GA4's AUTOMATIC page_view and send our own below.
      //
      // Setting page_location here is not enough on its own: enhanced
      // measurement's site-search detection reads the real document URL rather
      // than the page_location we pass, and `s` is one of GA4's default search
      // parameters — so a `?s=<shareId>` visit emitted a view_search_results
      // event carrying the capability token as `search_term`, straight past
      // the scrub. That detection rides on the automatic page_view, so turning
      // it off stops the token ever being read. Verified against the live
      // deployment.
      send_page_view: false,
      page_location: cleanLocation,
    })
    window.gtag('event', 'page_view', {
      page_location: cleanLocation,
      page_title: document.title,
    })
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
