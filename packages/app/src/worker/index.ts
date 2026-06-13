export interface Env {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KV_SHORTENER: any
  // R2 bucket holding the per-share OG preview PNGs (keyed by short id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  OG_IMAGES: any
  ASSETS: { fetch: typeof fetch }
}

const SHORTEN_TTL = 60 * 24 * 60 * 60 // 60 days in seconds
const SITE_NAME = 'Chaos Master'
const DEFAULT_TITLE = 'Fractal Flame — Chaos Master'
const DEFAULT_DESCRIPTION =
  'Explore and create fractal flames with Chaos Master.'

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
  let imageUrl: string | undefined
  try {
    const raw = await env.KV_SHORTENER.get(`og:${key}`)
    if (raw) {
      const meta = JSON.parse(raw) as OgMeta
      if (meta.t) title = meta.t
      if (meta.d) description = meta.d
      if (meta.img) imageUrl = `${origin}/og/${key}`
    }
  } catch (err) {
    console.error('Error reading OG meta:', err)
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
  html = html.replace('</head>', `    ${metaHtml}\n  </head>`)

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short cache — flame metadata behind a link can change.
      'Cache-Control': 'public, max-age=300',
    },
  })
}

export default {
  async fetch(request: Request, env: Env, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url)
    const { pathname } = url

    // ── Create a short link ────────────────────────────────────────────────
    if (pathname === '/api/shorten' && request.method === 'POST') {
      try {
        const { payload } = (await request.json()) as { payload: string }
        if (!payload || typeof payload !== 'string') {
          return json({ error: 'Invalid payload' }, 400)
        }
        const shortId = generateShortId()
        await env.KV_SHORTENER.put(shortId, payload, {
          expirationTtl: SHORTEN_TTL,
        })
        return json({ id: shortId })
      } catch (err) {
        console.error('Error handling /api/shorten POST:', err)
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
        console.error('Error handling /api/shorten GET:', err)
        return json({ error: 'Server error' }, 500)
      }
    }

    // ── Attach an OG preview image + meta, keyed by content hash ───────────
    // The client renders the flame on its GPU, downscales it, embeds the flame
    // descriptor in the PNG, and uploads it here (background) under
    // ogKey(payload) — so both ?s= and ?flame= links can resolve it.
    if (pathname.startsWith('/api/og/') && request.method === 'POST') {
      const key = pathname.split('/').pop()
      if (!key) return json({ error: 'Missing key' }, 400)
      try {
        const body = (await request.json()) as {
          image?: string
          title?: string
          description?: string
        }
        if (!body.image || typeof body.image !== 'string') {
          return json({ error: 'Missing image' }, 400)
        }
        const bytes = base64ToBytes(body.image)
        await env.OG_IMAGES.put(key, bytes, {
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
        console.error('Error handling /api/og POST:', err)
        return json({ error: 'Bad request' }, 400)
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
        console.error('Error serving OG image:', err)
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
        } as { title: string; description: string; imageUrl?: string }
        try {
          const payload = await env.KV_SHORTENER.get(shortId)
          if (payload) {
            card = await resolveOgCard(env, url.origin, await ogKey(payload))
          }
        } catch (err) {
          console.error('Error resolving short link OG:', err)
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

    // Everything else → static assets (the frontend)
    return env.ASSETS.fetch(request)
  },
}
