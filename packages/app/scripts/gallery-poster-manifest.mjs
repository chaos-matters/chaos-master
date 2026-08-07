import { createHash } from 'node:crypto'

export const POSTER_MANIFEST_VERSION = 2

function parseJson(value, label) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (error) {
      throw new Error(`${label} is not valid JSON: ${error.message}`)
    }
  }
  if (value === null || typeof value === 'object') return value
  throw new Error(`${label} must be JSON text, an object, an array, or null`)
}

function canonicalJson(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    return `{${entries.join(',')}}`
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return JSON.stringify(value)
  }
  throw new Error(`unsupported JSON value: ${String(value)}`)
}

/**
 * Hash the semantic flame and animation payloads, not their whitespace or key
 * order, so a poster can only be attached to the descriptor it rendered.
 */
export function galleryContentDigest(flame, animation) {
  const payload = {
    flame: parseJson(flame, 'flame'),
    animation: parseJson(animation, 'animation'),
  }
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

export function assertPosterManifestTarget(manifest, { env, storage }) {
  if (manifest === null || typeof manifest !== 'object') {
    throw new Error('poster manifest must be an object')
  }
  if (manifest.manifestVersion !== POSTER_MANIFEST_VERSION) {
    throw new Error(
      `poster manifest version must be ${POSTER_MANIFEST_VERSION}; recapture the posters`,
    )
  }
  if (manifest.env !== env || manifest.storage !== storage) {
    throw new Error(
      `poster manifest targets ${String(manifest.env)}/${String(manifest.storage)}, not ${env}/${storage}; recapture for the selected target`,
    )
  }
}

export function posterManifestMatchesTarget(manifest, { env, storage }) {
  return (
    manifest !== null &&
    typeof manifest === 'object' &&
    manifest.manifestVersion === POSTER_MANIFEST_VERSION &&
    manifest.env === env &&
    manifest.storage === storage
  )
}

export function mergePosterManifestEntries(manifest, entries, target) {
  const previous = posterManifestMatchesTarget(manifest, target)
    ? (manifest.posters ?? [])
    : []
  const bySlug = new Map(previous.map((poster) => [poster.slug, poster]))
  for (const entry of entries) bySlug.set(entry.slug, entry)
  return [...bySlug.values()].sort((a, b) =>
    a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0,
  )
}

export function assertPosterMatchesRow(poster, row) {
  if (!poster || typeof poster !== 'object') {
    throw new Error('poster manifest entry must be an object')
  }
  if (poster.slug !== row.slug) {
    throw new Error(
      `poster slug ${String(poster.slug)} does not match gallery row ${String(row.slug)}`,
    )
  }
  if (!/^[a-f0-9]{64}$/u.test(poster.contentDigest ?? '')) {
    throw new Error(
      `poster ${poster.slug} has no valid content digest; recapture it`,
    )
  }

  const currentDigest = galleryContentDigest(row.flame, row.animation)
  if (poster.contentDigest !== currentDigest) {
    throw new Error(
      `poster ${poster.slug} is stale for the current gallery descriptor; recapture it`,
    )
  }
}
