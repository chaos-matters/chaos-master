// Headers applied to every response (API, OG image, redirect, static assets).
// CSP is ENFORCED. 'unsafe-eval' is required: TypeGPU rebuilds shader
// functions at runtime via new Function, so WebGPU rendering breaks without
// it (it also covers WebAssembly compilation). 'unsafe-inline' in style-src
// covers inline / CSS-in-JS styles.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=(), browsing-topics=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
}

export const CSP_DIRECTIVES: readonly string[] = [
  "default-src 'self'",
  "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://*.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://challenges.cloudflare.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
]

/** Sixteen random bytes as base64: a fresh CSP nonce for one response. */
export function scriptNonce(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
}

export function contentSecurityPolicy(nonce: string): string {
  return CSP_DIRECTIVES.map((directive) =>
    directive.startsWith('script-src ')
      ? `${directive} 'nonce-${nonce}'`
      : directive,
  ).join('; ')
}

/** Return a copy of res with the security headers applied. */
export function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  headers.set('Content-Security-Policy', contentSecurityPolicy(scriptNonce()))
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}
