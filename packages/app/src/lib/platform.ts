// Where the app runs, and the absolute origins a native build needs.
//
// On the web the bundle is served by its own Worker, so relative URLs
// ('/api/…') and `location.origin` are correct. The Capacitor shell
// (packages/mobile) serves the same bundle from capacitor://localhost (iOS)
// or https://localhost (Android): there a relative '/api/…' resolves into the
// app bundle and a share link would point at localhost. Native builds get
// absolute origins from .env.native; web builds leave them unset and keep
// today's relative behaviour.

declare const __NATIVE_BUILD__: boolean

/**
 * True only in `vite build --mode native` (the Capacitor bundle), false in
 * every web build. Fine for branching, but the bundler does not fold it across
 * modules: code that must stay out of the web bundle (a dynamic import of
 * Capacitor code) tests `__NATIVE_BUILD__` in its own module, as
 * lib/nativeSave.ts does.
 */
export const IS_NATIVE: boolean = __NATIVE_BUILD__

/**
 * Which native shell the app is running in, or null on the web. The styles
 * that differ by platform key off it: lumen.css raises the minimum target to
 * 48dp under `[data-platform='android']`, which index.tsx writes on <html>.
 */
export function nativePlatform(
  native: boolean,
  userAgent: string,
): 'android' | 'ios' | null {
  if (!native) return null
  return /Android/i.test(userAgent) ? 'android' : 'ios'
}

const originFromEnv = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\/+$/, '') : ''

const API_ORIGIN = originFromEnv(import.meta.env.VITE_API_ORIGIN)
const PUBLIC_ORIGIN = originFromEnv(import.meta.env.VITE_PUBLIC_ORIGIN)

/**
 * URL for a Worker API path such as `/api/gallery`: relative on the web (same
 * origin as the Worker), absolute in native builds.
 */
export const apiUrl = (path: string): string => `${API_ORIGIN}${path}`

/**
 * Origin for links meant for other people (share links, the Discord invite):
 * the current origin on the web, the public site in native builds.
 */
export const publicOrigin = (): string =>
  PUBLIC_ORIGIN === '' ? globalThis.location.origin : PUBLIC_ORIGIN
