export interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KV_SHORTENER: any
  // R2 bucket holding the per-share OG preview PNGs (keyed by short id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OG_IMAGES: any
  // Per-IP rate limiter for the share/OG write endpoints.
  API_RL: { limit: (options: { key: string }) => Promise<{ success: boolean }> }
  // Stricter per-IP limiter dedicated to the Discord share endpoint.
  DISCORD_RL: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>
  }
  ASSETS: { fetch: typeof fetch }
  // Secrets (set via `wrangler secret put`). When unset the related feature is
  // treated as not-configured rather than enforced — keeps local dev working.
  TURNSTILE_SECRET?: string
  DISCORD_WEBHOOK_URL?: string
  DISCORD_INVITE_URL?: string
  // Comma-separated hostnames a Turnstile token may have been solved on (a var,
  // set per-env in wrangler.jsonc). When set, a token solved on one origin
  // can't be replayed against another. Unset → hostname is not pinned.
  TURNSTILE_ALLOWED_HOSTNAMES?: string
}

const SHORTEN_TTL = 60 * 24 * 60 * 60 // 60 days in seconds
// Upper bound on a shortener payload (an encoded flame + optional timeline).
// Bounds per-write KV storage and cost; a real payload is well under this.
const MAX_SHORTEN_PAYLOAD = 256 * 1024 // 256 KB
// Upper bound on an OG upload (JSON body). Legit previews are ~1–1.5 MB; this
// caps abuse so R2 storage — and cost — stays bounded.
const MAX_OG_UPLOAD = 4 * 1024 * 1024 // ~4 MB
// Discord shares carry the full-res flame PNG (much bigger than an OG thumb).
// Bound the request generously; Discord itself enforces its own file limit and
// a too-big upload just falls back to manual sharing. base64 inflates ~1.33x.
const MAX_DISCORD_UPLOAD = 12 * 1024 * 1024 // ~12 MB request (~9 MB image)
// Per-IP soft cap on Discord shares per day (secondary to the native limiter).
const DISCORD_DAILY_CAP = 15
const TURNSTILE_VERIFY_URL =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const SITE_NAME = 'Lumen Apeiron'
const DEFAULT_TITLE = 'Fractal Flame — Lumen Apeiron'
const DEFAULT_DESCRIPTION =
  'Explore and create fractal flames with Lumen Apeiron.'
// Fallback social-card image, served from static assets (public/og-cover.jpg).
// Used for the site's default card and for any shared flame that has no uploaded
// preview image, so every link still renders a rich summary_large_image card.
const DEFAULT_OG_PATH = '/og-cover.jpg'

interface OgMeta {
  t?: string
  d?: string
  img?: number
}

function generateShortId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  const array = new Uint8Array(8)
  globalThis.crypto.getRandomValues(array)
  for (let i = 0; i < array.length; i++) {
    id += chars.charAt(array[i]! % chars.length)
  }
  return id
}

// Reduce a thrown value to a log-safe message. Avoids dumping full Error objects
// (and any request/upstream detail they may carry) into log retention.
function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes
}

/**
 * Verify a Cloudflare Turnstile token server-side. Returns `true` only on an
 * explicit `success`. Reusable for any bot-gated endpoint (e.g. sign-in).
 */
async function verifyTurnstile(
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

/**
 * Reduce a share title/author to inert plain text before it goes into the
 * public channel: drop links, strip Discord markdown / mention / link syntax,
 * and collapse whitespace. Server-side so a crafted client can't bypass it.
 */
function sanitizeDiscordText(input: string): string {
  return input
    .replace(/\s+/g, ' ') // collapse newlines/whitespace
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '') // drop explicit links
    .replace(/[`*_~|<>@#\\[\]()]/g, '') // strip markdown / mention / link chars
    .replace(/\s+/g, ' ') // re-collapse after removals
    .trim()
    .slice(0, 200)
}

/** Discord message text: `**Title** -- by Author` (or just `by Author`). */
function buildDiscordContent(
  title: string | undefined,
  author: string,
): string {
  const parts: string[] = []
  if (title) parts.push(`**${title}**`)
  parts.push(`by ${author}`)
  return parts.join(' -- ')
}

/**
 * Content-addressed key for a share payload: a hash of the encoded payload.
 * The OG image + meta are keyed by this (not by the short id), so `?flame=…`
 * and `?s=<id>` resolve to the same image — even when the shortener wasn't used
 * or failed. The client computes the identical key when uploading.
 */
async function ogKey(encoded: string): Promise<string> {
  const data = new TextEncoder().encode(encoded)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Look up the stored OG title/description/image for a content key. */
async function resolveOgCard(
  env: Env,
  origin: string,
  key: string,
): Promise<{ title: string; description: string; imageUrl?: string }> {
  let title = DEFAULT_TITLE
  let description = DEFAULT_DESCRIPTION
  // Default to the site cover so a card without a custom upload still shows an
  // image; a stored preview (meta.img) overrides it below.
  let imageUrl: string | undefined = `${origin}${DEFAULT_OG_PATH}`
  try {
    const raw = await env.KV_SHORTENER.get(`og:${key}`)
    if (raw) {
      const meta = JSON.parse(raw) as OgMeta
      if (meta.t) title = meta.t
      if (meta.d) description = meta.d
      if (meta.img) imageUrl = `${origin}/og/${key}`
    }
  } catch (err) {
    console.error('Error reading OG meta:', errMsg(err))
  }
  return { title, description, imageUrl }
}

// ---------------------------------------------------------------------------
// Open Graph / Twitter meta-tag injection
// ---------------------------------------------------------------------------

function buildMetaTags(opts: {
  title: string
  description: string
  pageUrl: string
  imageUrl?: string
}): string {
  const t = escapeHtml(opts.title)
  const d = escapeHtml(opts.description)
  const u = escapeHtml(opts.pageUrl)
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ]
  if (opts.imageUrl) {
    const i = escapeHtml(opts.imageUrl)
    tags.push(
      `<meta property="og:image" content="${i}" />`,
      `<meta name="twitter:image" content="${i}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
    )
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`)
  }
  return tags.join('\n    ')
}

/**
 * Fetch the built index.html from static assets and inject OG/Twitter meta tags
 * (plus a richer <title>) so social crawlers render a preview card. The SPA
 * still boots normally for human visitors.
 */
async function injectMeta(
  env: Env,
  origin: string,
  title: string,
  metaHtml: string,
): Promise<Response> {
  const assetRes = await env.ASSETS.fetch(`${origin}/`)
  let html = await assetRes.text()

  html = html.replace(
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(title)}</title>`,
  )
  // Swap the static default OG/Twitter block (marked in index.html) for the
  // share-specific tags, so a shared link never carries duplicate og:* tags.
  // Fall back to appending before </head> if the markers aren't present.
  const swapped = html.replace(
    /<!-- og:default:start -->[\s\S]*?<!-- og:default:end -->/,
    metaHtml,
  )
  html =
    swapped !== html
      ? swapped
      : html.replace('</head>', `    ${metaHtml}\n  </head>`)

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short cache — flame metadata behind a link can change.
      'Cache-Control': 'public, max-age=300',
    },
  })
}

const baseHandler = {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // ── Rate-limit the write endpoints per IP ──────────────────────────────
    // Bounds spam/abuse (and R2/KV cost). Fail-open: a limiter hiccup or a
    // missing binding never breaks sharing.
    if (request.method === 'POST' && pathname.startsWith('/api/')) {
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

    // ── Create a short link ────────────────────────────────────────────────
    if (pathname === '/api/shorten' && request.method === 'POST') {
      try {
        const { payload } = (await request.json()) as { payload?: unknown }
        if (typeof payload !== 'string' || payload.length === 0) {
          return json({ error: 'Invalid payload' }, 400)
        }
        // Bound the stored value (the other write endpoints already cap their
        // uploads; the shortener was the one that didn't). Checking the parsed
        // string length, not the spoofable content-length header.
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

    // ── Resolve a short link's payload ─────────────────────────────────────
    if (pathname.startsWith('/api/shorten/') && request.method === 'GET') {
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

    // ── Attach an OG preview image + meta, keyed by content hash ───────────
    // The client renders the flame on its GPU, downscales it, embeds the flame
    // descriptor in the PNG, and uploads it here (background) under
    // ogKey(payload) — so both ?s= and ?flame= links can resolve it.
    if (pathname.startsWith('/api/og/') && request.method === 'POST') {
      const key = pathname.split('/').pop()
      // The key is a content hash — exactly 32 lowercase hex chars (see
      // `ogKey`). Validate the shape so a malformed/abusive key never reaches
      // R2 or KV.
      if (!key || !/^[0-9a-f]{32}$/.test(key)) {
        return json({ error: 'Invalid key' }, 400)
      }
      if (Number(request.headers.get('content-length') ?? 0) > MAX_OG_UPLOAD) {
        return json({ error: 'Image too large' }, 413)
      }
      try {
        const body = (await request.json()) as {
          image?: string
          title?: string
          description?: string
        }
        if (!body.image || typeof body.image !== 'string') {
          return json({ error: 'Missing image' }, 400)
        }
        if (body.image.length > MAX_OG_UPLOAD) {
          return json({ error: 'Image too large' }, 413)
        }
        // Reject non-PNG uploads up front (every PNG's base64 starts with the
        // encoded 8-byte signature) — the same guard the Discord path uses.
        if (!body.image.startsWith('iVBORw0KGgo')) {
          return json({ error: 'Not a PNG image' }, 415)
        }
        const ogBytes = base64ToBytes(body.image)
        // First-writer-wins. The key is a public, client-recomputable hash of
        // the share payload, so the first honest upload is by definition the
        // correct image for that key. Freezing it closes the cache-poisoning
        // vector — otherwise anyone could recompute a shared flame's key and
        // overwrite its social-preview image/title/description. Honest
        // re-uploads of the same content are simply idempotent.
        //
        // This check-then-put is not perfectly atomic (R2 has no
        // put-if-absent primitive), so a sufficiently precise concurrent
        // request could still race here in principle — but decoding/
        // validating the body first (rather than between the check and the
        // write, as before) shrinks that window to just the write itself.
        const existing = await env.OG_IMAGES.head(key)
        if (existing) {
          return json({ ok: true, deduped: true })
        }
        await env.OG_IMAGES.put(key, ogBytes, {
          httpMetadata: { contentType: 'image/png' },
        })
        const meta: OgMeta = {
          t: body.title?.slice(0, 200),
          d: body.description?.slice(0, 300),
          img: 1,
        }
        await env.KV_SHORTENER.put(`og:${key}`, JSON.stringify(meta), {
          expirationTtl: SHORTEN_TTL,
        })
        return json({ ok: true })
      } catch (err) {
        console.error('Error handling /api/og POST:', errMsg(err))
        return json({ error: 'Bad request' }, 400)
      }
    }

    // ── Share a flame to Discord (server-side webhook proxy) ───────────────
    // The webhook URL lives as a Worker secret — never in the client bundle.
    // Gated by Turnstile + a stricter per-IP limiter + a daily KV cap so the
    // public channel can't be spammed the way the leaked client webhook was.
    if (pathname === '/api/share-discord' && request.method === 'POST') {
      if (
        Number(request.headers.get('content-length') ?? 0) > MAX_DISCORD_UPLOAD
      ) {
        return json({ error: 'Image too large' }, 413)
      }
      let body: {
        image?: string
        title?: string
        author?: string
        token?: string
      }
      try {
        body = (await request.json()) as typeof body
      } catch {
        return json({ error: 'Bad request' }, 400)
      }
      const { image, token } = body
      const author = body.author?.trim()
      const title = body.title?.trim()
      if (!image || typeof image !== 'string') {
        return json({ error: 'Missing image' }, 400)
      }
      if (image.length > MAX_DISCORD_UPLOAD) {
        return json({ error: 'Image too large' }, 413)
      }
      // Reject non-PNG uploads early (before the Turnstile round-trip). Every
      // PNG's base64 begins with the encoded 8-byte signature; this inspects
      // only the header and leaves the embedded flame-data chunk untouched.
      if (!image.startsWith('iVBORw0KGgo')) {
        return json({ error: 'Not a PNG image' }, 415)
      }
      if (!author) {
        return json({ error: 'Missing author' }, 400)
      }

      const ip = request.headers.get('cf-connecting-ip') ?? 'anon'

      // Bot check — fail-closed, but only enforced once a secret is configured.
      if (env.TURNSTILE_SECRET) {
        const allowedHostnames = env.TURNSTILE_ALLOWED_HOSTNAMES
          ? env.TURNSTILE_ALLOWED_HOSTNAMES.split(',')
              .map((h) => h.trim())
              .filter(Boolean)
          : undefined
        const ok = await verifyTurnstile(
          env.TURNSTILE_SECRET,
          token ?? '',
          request.headers.get('cf-connecting-ip'),
          allowedHostnames,
        )
        if (!ok) return json({ error: 'Bot check failed' }, 403)
      }

      // Stricter per-IP burst limit, on top of the generic /api/ limiter above.
      try {
        const { success } = await env.DISCORD_RL.limit({ key: ip })
        if (!success) {
          return json({ error: 'Too many requests, please slow down' }, 429)
        }
      } catch (err) {
        console.error(
          'Discord rate limit check failed (allowing):',
          errMsg(err),
        )
      }

      // Per-IP daily cap via KV (counts attempts, so a broken webhook can't be
      // used to hammer the endpoint). Fail-open on KV hiccups.
      //
      // Best-effort by design: KV has no atomic increment, so this get-then-put
      // races under concurrency and the cap can be modestly overshot. That is
      // acceptable here — the native per-IP DISCORD_RL limiter (1/min) is the
      // hard bound; this cap only smooths long-tail daily volume. Promote to a
      // Durable Object if an exact cap is ever required.
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

      if (!env.DISCORD_WEBHOOK_URL) {
        return json({ error: 'Sharing not configured' }, 503)
      }

      try {
        const bytes = base64ToBytes(image)
        const form = new FormData()
        form.append(
          'file',
          // base64ToBytes returns a fresh full-length view, so its buffer is the
          // exact image bytes (cast narrows ArrayBufferLike → ArrayBuffer).
          new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' }),
          'flame.png',
        )
        form.append(
          'payload_json',
          JSON.stringify({
            content: buildDiscordContent(
              title ? sanitizeDiscordText(title) || undefined : undefined,
              sanitizeDiscordText(author) || 'anonymous',
            ),
            // Never let a crafted title/author ping anyone.
            allowed_mentions: { parse: [] },
            // SUPPRESS_EMBEDS (1 << 2): a URL injected into the title/author
            // can't auto-expand into a rich link-preview embed in the channel.
            flags: 4,
          }),
        )
        const res = await fetch(env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          body: form,
        })
        return json({ ok: res.ok }, res.ok ? 200 : 502)
      } catch (err) {
        console.error('Error forwarding to Discord:', errMsg(err))
        return json({ ok: false }, 502)
      }
    }

    // ── Serve an OG preview image ──────────────────────────────────────────
    if (pathname.startsWith('/og/') && request.method === 'GET') {
      const id = pathname.slice('/og/'.length).replace(/\.png$/, '')
      if (!id) return new Response('Not found', { status: 404 })
      try {
        const obj = await env.OG_IMAGES.get(id)
        if (!obj) return new Response('Not found', { status: 404 })
        return new Response(obj.body, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
          },
        })
      } catch (err) {
        console.error('Error serving OG image:', errMsg(err))
        return new Response('Server error', { status: 500 })
      }
    }

    // ── Inject meta tags for shared links so crawlers see a rich preview ────
    if (
      (pathname === '/' || pathname === '/index.html') &&
      request.method === 'GET'
    ) {
      const shortId = url.searchParams.get('s')
      const flame = url.searchParams.get('flame')

      // Short link: resolve the payload from KV, then hash it to the content key
      // so it finds the same image a ?flame= link would.
      if (shortId) {
        let card = {
          title: DEFAULT_TITLE,
          description: DEFAULT_DESCRIPTION,
          imageUrl: `${url.origin}${DEFAULT_OG_PATH}`,
        } as { title: string; description: string; imageUrl?: string }
        try {
          const payload = await env.KV_SHORTENER.get(shortId)
          if (payload) {
            card = await resolveOgCard(env, url.origin, await ogKey(payload))
          }
        } catch (err) {
          console.error('Error resolving short link OG:', errMsg(err))
        }
        const metaHtml = buildMetaTags({
          ...card,
          pageUrl: `${url.origin}/?s=${shortId}`,
        })
        return injectMeta(env, url.origin, card.title, metaHtml)
      }

      // Long-form link: hash the inline payload directly. Same OG card as ?s=,
      // including the image when the client uploaded one (text card otherwise).
      if (flame) {
        const card = await resolveOgCard(env, url.origin, await ogKey(flame))
        const metaHtml = buildMetaTags({
          ...card,
          pageUrl: url.toString(),
        })
        return injectMeta(env, url.origin, card.title, metaHtml)
      }
    }

    // ── Discord invite redirect ───────────────────────────────────────────
    // Keeps the real invite out of the static bundle (no scraping) and lets it
    // be rotated via `wrangler secret put DISCORD_INVITE_URL` — no redeploy.
    if (pathname === '/discord' && request.method === 'GET') {
      if (!env.DISCORD_INVITE_URL) {
        return json({ error: 'Discord invite not configured' }, 503)
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location: env.DISCORD_INVITE_URL,
          'Cache-Control': 'no-store',
        },
      })
    }

    // Everything else → static assets (the frontend)
    return env.ASSETS.fetch(request)
  },
}

// Headers applied to every response (API, OG image, redirect, static assets).
// CSP is ENFORCED. `'unsafe-eval'` is required: TypeGPU rebuilds shader
// functions at runtime via `new Function`, so WebGPU rendering breaks without
// it (it also covers WebAssembly compilation). `'unsafe-inline'` in style-src
// covers inline / CSS-in-JS styles. This is deliberately not a "strict" CSP,
// but it still blocks inline <script> / event-handler injection (no
// 'unsafe-inline' in script-src), cross-origin scripts / frames / connections,
// clickjacking (frame-ancestors), and <base> injection.
const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Enforce HTTPS for two years incl. subdomains. Browsers ignore this header
  // over plain HTTP (e.g. `wrangler dev` on localhost), so it is safe to always
  // send. If HSTS is also managed at the Cloudflare zone level, this is a no-op.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  // Lock down powerful features the app never uses. WebGPU is not gated by
  // Permissions-Policy, and clipboard-write / fullscreen stay enabled for self.
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()',
  // Disable legacy Adobe cross-domain policy files.
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Content-Security-Policy': [
    "default-src 'self'",
    // GA4 pixels: google-analytics.com is the no-JS/beacon fallback,
    // googletagmanager.com serves /td and /a (verified blocked by Google's Tag
    // Assistant before these were listed).
    "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
    // 'unsafe-eval' is mandatory — TypeGPU uses new Function for shader codegen.
    // googletagmanager.com serves gtag.js (see lib/telemetry.ts); without it
    // the loader is refused and no analytics event is ever recorded.
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' https://challenges.cloudflare.com https://*.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    // GA4 beacons go to google-analytics.com (regional endpoints on
    // analytics.google.com); googletagmanager.com is needed for the container
    // /td fetches. This is the allowlist Google documents for gtag.js at
    // developers.google.com/tag-platform/security/guides/csp — kept explicit
    // rather than widening to `https:`, which would defeat the point of an
    // allowlist-based policy.
    "connect-src 'self' https://challenges.cloudflare.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    'frame-src https://challenges.cloudflare.com',
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
}

/** Return a copy of `res` with the security headers applied. */
function withSecurityHeaders(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  })
}

export default {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    return withSecurityHeaders(await baseHandler.fetch(request, env, ctx))
  },
}
