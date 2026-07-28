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
      // Send page_view explicitly (below) rather than letting GA4 generate it,
      // so page_location is deterministically the scrubbed value.
      send_page_view: false,
      page_location: cleanLocation,
    })
    window.gtag('event', 'page_view', {
      page_location: cleanLocation,
      page_title: document.title,
    })

    // KNOWN GAP — not fixable from here. GA4 enhanced measurement's site-search
    // detection reads the real `document.location`, not the page_location above,
    // and `s` is one of its default search parameters. A `?s=<shareId>` visit
    // therefore emits `view_search_results` with the capability token as
    // `search_term`. Suppressing the automatic page_view does NOT stop it —
    // measured against the live deployment, the event still fires.
    //
    // The fix is a property setting: GA4 Admin -> Data streams -> the web
    // stream -> Enhanced measurement -> turn off "Site search" (or remove `s`
    // from its query-parameter list). A code-side guarantee would mean either
    // renaming the share parameter or stripping the query via replaceState
    // before gtag loads, and the latter changes what a reload of a share link
    // does — both are deliberate product changes, not a hotfix.
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
