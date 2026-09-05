import { DEFAULT_DESCRIPTION, DEFAULT_OG_PATH, DEFAULT_TITLE, MAX_OG_UPLOAD, SHORTEN_TTL, SITE_NAME, } from '../types'
import { base64ToBytes, errMsg, escapeHtml, json } from '../utils'
import type { Env, OgMeta } from '../types'

/**
 * Content-addressed key for a share payload: a hash of the encoded payload.
 * The OG image + meta are keyed by this (not by the short id), so `?flame=…`
 * and `?s=<id>` resolve to the same image — even when the shortener wasn't used
 * or failed. The client computes the identical key when uploading.
 */
export async function ogKey(encoded: string): Promise<string> {
  const data = new TextEncoder().encode(encoded)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Look up the stored OG title/description/image for a content key. */
export async function resolveOgCard(
  env: Env,
  origin: string,
  key: string,
): Promise<{ title: string; description: string; imageUrl?: string }> {
  let title = DEFAULT_TITLE
  let description = DEFAULT_DESCRIPTION
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

export function buildMetaTags(opts: {
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
 * (plus a richer <title>) so social crawlers render a preview card.
 */
export async function injectMeta(
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
      'Cache-Control': 'public, max-age=300',
    },
  })
}

/**
 * Attach an OG preview image + meta, keyed by content hash (POST /api/og/:key).
 */
export async function handleOgPost(
  request: Request,
  env: Env,
  pathname: string,
): Promise<Response> {
  const key = pathname.split('/').pop()
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
    if (!body.image.startsWith('iVBORw0KGgo')) {
      return json({ error: 'Not a PNG image' }, 415)
    }
    const ogBytes = base64ToBytes(body.image)
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

/**
 * Serve an OG preview image (GET /og/:id).
 */
export async function handleOgGet(
  pathname: string,
  env: Env,
): Promise<Response> {
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

/**
 * Inject meta tags for shared links so crawlers see a rich preview (/ or /index.html).
 */
export async function handleMetaInject(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const shortId = url.searchParams.get('s')
  const flame = url.searchParams.get('flame')

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

  if (flame) {
    const card = await resolveOgCard(env, url.origin, await ogKey(flame))
    const metaHtml = buildMetaTags({
      ...card,
      pageUrl: url.toString(),
    })
    return injectMeta(env, url.origin, card.title, metaHtml)
  }

  return null
}
