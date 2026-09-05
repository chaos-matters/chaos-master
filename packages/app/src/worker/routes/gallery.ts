import { GALLERY_CACHE_SECONDS, GALLERY_SECTIONS } from '../types'
import { errMsg, json, jsonCached } from '../utils'
import type { Env } from '../types'

export const MISSING_TABLE =
  /no such table:\s*(?:main\.)?(?:gallery_items|home_config)\b/i
export const MISSING_GALLERY_PROVENANCE_COLUMN =
  /no such column:\s*(?:collection|provenance_kind|source_url|license|license_url|attribution|changes|original_id)\b/i
export const MISSING_GALLERY_COMMUNITY_COLUMN =
  /no such column:\s*(?:submission_source|moderation_status|consent_version|reviewed_at)\b/i

export const GALLERY_PROVENANCE_COLUMNS =
  'collection, provenance_kind, source_url, license, license_url, ' +
  'attribution, changes, original_id'
export const LEGACY_GALLERY_PROVENANCE_COLUMNS =
  "CASE WHEN slug LIKE 'classic-%' THEN 'foundation' ELSE 'original' END " +
  "AS collection, 'unknown' AS provenance_kind, NULL AS source_url, " +
  'NULL AS license, NULL AS license_url, NULL AS attribution, ' +
  'NULL AS changes, NULL AS original_id'
export const GALLERY_COMMUNITY_COLUMNS =
  'submission_source, moderation_status, consent_version, reviewed_at'
export const LEGACY_GALLERY_COMMUNITY_COLUMNS =
  "'curated' AS submission_source, 'curated' AS moderation_status, " +
  'NULL AS consent_version, NULL AS reviewed_at'
export const GALLERY_COMMUNITY_PUBLIC_PREDICATE =
  " AND (submission_source <> 'discord' OR moderation_status = 'approved')"

/** Did this D1 failure mean "a content table does not exist"? */
export function isMissingTable(err: unknown): boolean {
  return MISSING_TABLE.test(errMsg(err))
}

/**
 * Migration 0005 can be applied just after a Worker deploy without taking Home
 * down in between. Only a known missing provenance column gets the legacy
 * projection; every other D1 error still fails loudly.
 */
export async function withGalleryColumnsFallback<T>(
  read: (columns: {
    provenance: string
    community: string
    communityPublicPredicate: string
  }) => Promise<T>,
): Promise<T> {
  let provenance = GALLERY_PROVENANCE_COLUMNS
  let community = GALLERY_COMMUNITY_COLUMNS
  let communityPublicPredicate = GALLERY_COMMUNITY_PUBLIC_PREDICATE

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await read({
        provenance,
        community,
        communityPublicPredicate,
      })
    } catch (err) {
      const message = errMsg(err)
      if (
        provenance === GALLERY_PROVENANCE_COLUMNS &&
        MISSING_GALLERY_PROVENANCE_COLUMN.test(message)
      ) {
        console.warn(
          'gallery provenance migration is pending — serving compatible defaults',
        )
        provenance = LEGACY_GALLERY_PROVENANCE_COLUMNS
        continue
      }
      if (
        community === GALLERY_COMMUNITY_COLUMNS &&
        MISSING_GALLERY_COMMUNITY_COLUMN.test(message)
      ) {
        console.warn(
          'gallery community migration is pending — serving curated rows compatibly',
        )
        community = LEGACY_GALLERY_COMMUNITY_COLUMNS
        communityPublicPredicate = ''
        continue
      }
      throw err
    }
  }
  throw new Error('gallery compatibility fallback exhausted')
}

export function parseSequence(value: unknown, slug: string): unknown[] | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    console.warn(`gallery '${slug}': unreadable sequence —`, errMsg(err))
    return null
  }
}

/**
 * Home gallery content (GET /api/gallery).
 */
export async function handleGalleryList(url: URL, env: Env): Promise<Response> {
  if (!env.CONTENT_DB) return json({ error: 'Not configured' }, 503)
  const section = url.searchParams.get('section')
  if (section !== null && !GALLERY_SECTIONS.includes(section)) {
    return json({ error: 'Unknown section' }, 400)
  }
  try {
    const { results } = await withGalleryColumnsFallback<{
      results?: unknown[]
    }>(({ provenance, community, communityPublicPredicate }) => {
      const base =
        `SELECT slug, title, caption, author, section, capability, ` +
        `${provenance}, ${community}, dimensions, transform_count, poster_key, ` +
        `poster_width, poster_height, poster_frame, sort_order, ` +
        `(animation IS NOT NULL) AS has_animation ` +
        `FROM gallery_items WHERE published = 1${communityPublicPredicate}`
      const stmt =
        section === null
          ? env.CONTENT_DB.prepare(`${base} ORDER BY section, sort_order, slug`)
          : env.CONTENT_DB.prepare(
              `${base} AND section = ? ORDER BY sort_order, slug`,
            ).bind(section)
      return stmt.all()
    })
    return jsonCached({ items: results ?? [] }, GALLERY_CACHE_SECONDS)
  } catch (err) {
    console.error('Error handling /api/gallery:', errMsg(err))
    return json({ error: 'Server error' }, 500)
  }
}

/**
 * Home settings (D1) (GET /api/gallery/config).
 */
export async function handleGalleryConfig(env: Env): Promise<Response> {
  if (!env.CONTENT_DB) return json({ error: 'Not configured' }, 503)
  try {
    const { results } = await env.CONTENT_DB.prepare(
      'SELECT key, value FROM home_config',
    ).all()
    const config: Record<string, string> = {}
    for (const row of (results ?? []) as { key: string; value: string }[]) {
      config[row.key] = row.value
    }
    return jsonCached({ config }, GALLERY_CACHE_SECONDS)
  } catch (err) {
    if (isMissingTable(err)) {
      console.warn(
        '/api/gallery/config: home_config is missing — serving an empty ' +
          'config. Apply the D1 migrations to configure Home.',
      )
      return jsonCached({ config: {} }, GALLERY_CACHE_SECONDS)
    }
    console.error('Error handling /api/gallery/config:', errMsg(err))
    return json({ error: 'Server error' }, 500)
  }
}

/**
 * Poster images for the no-WebGPU fallback (GET /api/gallery/poster/:key).
 */
export async function handleGalleryPoster(
  pathname: string,
  env: Env,
): Promise<Response> {
  const key = pathname.slice('/api/gallery/poster/'.length)
  if (!/^[a-z0-9][a-z0-9./-]{0,127}$/.test(key) || key.includes('..')) {
    return new Response('Invalid key', { status: 400 })
  }
  try {
    const obj = await env.OG_IMAGES.get(`gallery/${key}`)
    if (!obj) return new Response('Not found', { status: 404 })
    return new Response(obj.body, {
      headers: {
        'Content-Type':
          obj.httpMetadata?.contentType ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (err) {
    console.error('Error handling /api/gallery/poster:', errMsg(err))
    return new Response('Server error', { status: 500 })
  }
}

/**
 * Single gallery item details (GET /api/gallery/:slug).
 */
export async function handleGallerySlug(
  pathname: string,
  env: Env,
): Promise<Response> {
  if (!env.CONTENT_DB) return json({ error: 'Not configured' }, 503)
  const slug = pathname.slice('/api/gallery/'.length)
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    return json({ error: 'Invalid slug' }, 400)
  }
  try {
    const row = await withGalleryColumnsFallback<Record<
      string,
      unknown
    > | null>(({ provenance, community, communityPublicPredicate }) =>
      env.CONTENT_DB.prepare(
        `SELECT slug, title, caption, author, section, capability, flame, ` +
          `animation, sequence, ${provenance}, ${community}, dimensions, ` +
          `transform_count, poster_key, poster_width, poster_height, ` +
          `poster_frame FROM gallery_items ` +
          `WHERE slug = ? AND published = 1${communityPublicPredicate}`,
      )
        .bind(slug)
        .first(),
    )
    if (!row) return json({ error: 'Not found' }, 404)
    return jsonCached(
      {
        ...row,
        flame: JSON.parse(row.flame as string),
        animation:
          row.animation === null ? null : JSON.parse(row.animation as string),
        sequence: parseSequence(row.sequence, slug),
      },
      GALLERY_CACHE_SECONDS,
    )
  } catch (err) {
    console.error('Error handling /api/gallery/:slug:', errMsg(err))
    return json({ error: 'Server error' }, 500)
  }
}
