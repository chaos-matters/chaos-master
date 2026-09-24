// isAppleWebKit decides which engines get the WebKit-only handling: no view
// transitions (lib/viewTransition.ts) and the present pump
// (flame/renderDrivers/createInteractiveRenderDriver.ts). It keys on
// navigator.vendor alone. WebCore fixes that string at build time for every
// port and every app that embeds it, Safari and WKWebView alike
// (NavigatorBase.cpp, WEBCORE_NAVIGATOR_VENDOR); Blink reports 'Google Inc.'
// and Gecko an empty string. The user agents below only say where each vendor
// string comes from, and show why the user agent cannot decide: Chrome's
// carries AppleWebKit and Safari, iPadOS asks for pages as a Mac, and the
// Capacitor app's WKWebView has no Safari token at all.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAppleWebKit } from './platform'

const APPLE = 'Apple Computer, Inc.'
const GOOGLE = 'Google Inc.'

const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'

const ENGINES = [
  {
    name: 'iOS Safari',
    vendor: APPLE,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    apple: true,
  },
  {
    name: 'iPadOS Safari, asking for pages as a Mac',
    vendor: APPLE,
    userAgent: MAC_SAFARI,
    apple: true,
  },
  { name: 'macOS Safari', vendor: APPLE, userAgent: MAC_SAFARI, apple: true },
  {
    name: 'the Capacitor iOS app, a WKWebView',
    vendor: APPLE,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    apple: true,
  },
  {
    name: 'the Capacitor app on an iPad, a WKWebView asking as a Mac',
    vendor: APPLE,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    apple: true,
  },
  {
    name: 'Chrome on iOS, which is WebKit underneath',
    vendor: APPLE,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1',
    apple: true,
  },
  {
    name: 'Chrome on macOS',
    vendor: GOOGLE,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    apple: false,
  },
  {
    name: 'Chrome on Android',
    vendor: GOOGLE,
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    apple: false,
  },
  {
    name: 'the Capacitor Android app, an Android System WebView',
    vendor: GOOGLE,
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36',
    apple: false,
  },
  {
    name: 'Firefox',
    vendor: '',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
    apple: false,
  },
]

describe('isAppleWebKit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(ENGINES)('$name: $apple', ({ vendor, userAgent, apple }) => {
    vi.stubGlobal('navigator', { vendor, userAgent })
    expect(isAppleWebKit()).toBe(apple)
  })

  it('is false where there is no navigator', () => {
    vi.stubGlobal('navigator', undefined)
    expect(isAppleWebKit()).toBe(false)
  })
})
