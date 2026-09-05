import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { tryValidateTimelineSnapshot } from '@/flame/schema/timeline'
import { SHOWCASE_CONSENT_VERSION } from '@/lib/communityShowcase'
import { checkDiscordDailyCap, checkDiscordRateLimit, } from '../middleware/rateLimit'
import { verifyTurnstile } from '../middleware/turnstile'
import { MAX_DISCORD_UPLOAD, MAX_SHOWCASE_DESCRIPTOR } from '../types'
import { base64ToBytes, errMsg, isPlainRecord, json, pngDimensions, slugWord, } from '../utils'
import type { Env, ShowcaseRequest, ShowcaseStatus } from '../types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * Reduce a share title/author to inert plain text before it goes into the
 * public channel: drop links, strip Discord markdown / mention / link syntax,
 * and collapse whitespace. Server-side so a crafted client can't bypass it.
 */
export function sanitizeDiscordText(input: string): string {
  return input
    .replace(/\s+/g, ' ') // collapse newlines/whitespace
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '') // drop explicit links
    .replace(/[`*_~|<>@#\\[\]()]/g, '') // strip markdown / mention / link chars
    .replace(/\s+/g, ' ') // re-collapse after removals
    .trim()
    .slice(0, 200)
}

/** Discord message text: `**Title** -- by Author` (or just `by Author`). */
export function buildDiscordContent(
  title: string | undefined,
  author: string,
): string {
  const parts: string[] = []
  if (title) parts.push(`**${title}**`)
  parts.push(`by ${author}`)
  return parts.join(' -- ')
}

export function safeShowcaseShareUrl(
  value: unknown,
  requestUrl: URL,
): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    if (
      url.origin !== requestUrl.origin ||
      url.pathname !== '/' ||
      (!url.searchParams.has('s') && !url.searchParams.has('flame'))
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function containsCustomVariation(flame: FlameDescriptor): boolean {
  for (const transform of Object.values(flame.transforms)) {
    for (const variation of Object.values(transform.variations)) {
      if (variation.type.startsWith('custom_')) return true
    }
  }
  return false
}

export function validateShowcaseAnimation(value: unknown): unknown | null {
  if (value === undefined || value === null) return null
  if (!isPlainRecord(value) || !isPlainRecord(value.config)) return undefined
  const snapshot = tryValidateTimelineSnapshot({
    config: { ...value.config, timeScale: 1 },
    tracks: value.tracks,
  })
  if (snapshot === undefined) return undefined
  const { timeScale: _timeScale, ...config } = snapshot.config
  return { tracks: snapshot.tracks, config }
}

/**
 * Stage an explicitly consented Discord share for human moderation.
 */
export async function stageCommunityShowcase(
  env: Env,
  requestUrl: URL,
  rawShowcase: unknown,
  imageBytes: Uint8Array,
  publicAuthor: string,
  publicTitle: string | undefined,
): Promise<ShowcaseStatus> {
  if (!isPlainRecord(rawShowcase)) return 'not-requested'
  const showcase = rawShowcase as ShowcaseRequest
  if (showcase?.consent !== true) return 'not-requested'
  if (showcase.consentVersion !== SHOWCASE_CONSENT_VERSION || !env.CONTENT_DB) {
    return 'unavailable'
  }

  try {
    const rawFlame = showcase.flame
    const rawFlameJson = JSON.stringify(rawFlame)
    if (
      rawFlameJson === undefined ||
      rawFlameJson.length > MAX_SHOWCASE_DESCRIPTOR
    ) {
      return 'unavailable'
    }
    const flame = tryValidateFlame(rawFlame)
    const animation = validateShowcaseAnimation(showcase.animation)
    const sourceUrl = safeShowcaseShareUrl(showcase.shareUrl, requestUrl)
    const dimensions = pngDimensions(imageBytes)
    if (
      flame === undefined ||
      animation === undefined ||
      sourceUrl === null ||
      dimensions === undefined ||
      containsCustomVariation(flame)
    ) {
      return 'unavailable'
    }

    const title =
      (publicTitle && sanitizeDiscordText(publicTitle)) ||
      sanitizeDiscordText(flame.metadata?.name ?? '') ||
      'Community flame'
    const author = sanitizeDiscordText(publicAuthor) || 'anonymous'
    const storedFlame: FlameDescriptor = {
      ...flame,
      metadata: {
        ...flame.metadata,
        name: title,
        author,
      },
    }
    const id = globalThis.crypto.randomUUID().replaceAll('-', '')
    const slug = `community-${slugWord(title) || 'flame'}-${id.slice(0, 8)}`
    const posterKey = `community/${slug}.png`
    const flameJson = JSON.stringify(storedFlame)
    const animationJson = animation === null ? null : JSON.stringify(animation)
    const sortOrder = -Math.floor(Date.now() / 1000)
    const descriptorHash = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(flameJson),
    )
    const originalId = [...new Uint8Array(descriptorHash)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32)

    await env.CONTENT_DB.prepare(
      'INSERT INTO gallery_items (' +
        'slug, title, caption, author, section, capability, flame, animation, ' +
        'collection, provenance_kind, source_url, license, license_url, ' +
        'attribution, changes, original_id, dimensions, transform_count, ' +
        'poster_key, poster_width, poster_height, poster_frame, sort_order, ' +
        'published, submission_source, moderation_status, consent_version' +
        ') VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ' +
        '?, ?, NULL, NULL, NULL, NULL, ?, 0, ?, ?, ?)',
    )
      .bind(
        slug,
        title,
        flame.metadata?.description?.trim().slice(0, 280) || null,
        author,
        'gallery',
        flameJson,
        animationJson,
        'artist',
        'permission',
        sourceUrl,
        'Creator permission to feature and provide editable source in the Lumen Apeiron community showcase',
        `By ${author}`,
        originalId,
        storedFlame.renderSettings?.dimensions === 3 ? 3 : 2,
        Object.keys(storedFlame.transforms).length,
        sortOrder,
        'discord',
        'pending',
        SHOWCASE_CONSENT_VERSION,
      )
      .run()

    try {
      await env.OG_IMAGES.put(`gallery/${posterKey}`, imageBytes, {
        httpMetadata: { contentType: 'image/png' },
      })
      await env.CONTENT_DB.prepare(
        'UPDATE gallery_items SET poster_key = ?, poster_width = ?, ' +
          'poster_height = ? WHERE slug = ? AND moderation_status = ?',
      )
        .bind(posterKey, dimensions.width, dimensions.height, slug, 'pending')
        .run()
    } catch (err) {
      console.error(
        `Community showcase poster could not be attached for ${slug}:`,
        errMsg(err),
      )
    }
    return 'queued'
  } catch (err) {
    console.error(
      'Community showcase submission could not be staged:',
      errMsg(err),
    )
    return 'unavailable'
  }
}

/**
 * Share a flame to Discord (POST /api/share-discord).
 */
export async function handleShareDiscord(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_DISCORD_UPLOAD) {
    return json({ error: 'Image too large' }, 413)
  }
  let body: {
    image?: string
    title?: string
    author?: string
    token?: string
    showcase?: unknown
  }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  const { image, token } = body
  const author =
    typeof body.author === 'string' ? body.author.trim() : undefined
  const title = typeof body.title === 'string' ? body.title.trim() : undefined
  if (!image || typeof image !== 'string') {
    return json({ error: 'Missing image' }, 400)
  }
  if (image.length > MAX_DISCORD_UPLOAD) {
    return json({ error: 'Image too large' }, 413)
  }
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

  const rateLimitErr = await checkDiscordRateLimit(ip, env)
  if (rateLimitErr) return rateLimitErr

  const dailyCapErr = await checkDiscordDailyCap(ip, env)
  if (dailyCapErr) return dailyCapErr

  if (!env.DISCORD_WEBHOOK_URL) {
    return json({ error: 'Sharing not configured' }, 503)
  }

  try {
    const bytes = base64ToBytes(image)
    const form = new FormData()
    form.append(
      'file',
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
        allowed_mentions: { parse: [] },
        flags: 4,
      }),
    )
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) return json({ ok: false }, 502)
    const showcase = await stageCommunityShowcase(
      env,
      url,
      body.showcase,
      bytes,
      author,
      title,
    )
    return json({ ok: true, showcase })
  } catch (err) {
    console.error('Error forwarding to Discord:', errMsg(err))
    return json({ ok: false }, 502)
  }
}

/**
 * Discord invite redirect (GET /discord).
 */
export function handleDiscordRedirect(env: Env): Response {
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
