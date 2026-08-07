export const GALLERY_COLLECTIONS = ['foundation', 'original', 'remix', 'artist']

export const PROVENANCE_KINDS = [
  'unknown',
  'project-original',
  'public-domain',
  'licensed',
  'permission',
]

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function issue(code, message) {
  return { code, message }
}

/**
 * Everything that must be resolved before a row is safe to publish. The
 * caller decides whether issues are warnings (local curation) or blockers
 * (shared dev/prod), keeping one policy instead of parallel CLI checks.
 */
export function publicationIssues(row) {
  const issues = []
  const author = text(row.author)
  const collection = text(row.collection)
  const provenance = text(row.provenance_kind)
  const sourceUrl = text(row.source_url)
  const license = text(row.license)
  const licenseUrl = text(row.license_url)

  const hasPoster = row.poster_key !== null && text(row.poster_key) !== ''
  if (!hasPoster) {
    issues.push(issue('poster-missing', 'capture a poster before publication'))
  } else if (
    !Number.isInteger(row.poster_width) ||
    row.poster_width <= 0 ||
    !Number.isInteger(row.poster_height) ||
    row.poster_height <= 0
  ) {
    issues.push(
      issue(
        'poster-dimensions-invalid',
        'poster width and height must be positive integers',
      ),
    )
  }
  if (row.has_animation === 1 && row.poster_frame === null) {
    issues.push(
      issue(
        'poster-frame-missing',
        'animated rows need the frame used for their poster',
      ),
    )
  }
  if (!GALLERY_COLLECTIONS.includes(collection)) {
    issues.push(
      issue('collection-unknown', 'choose a known gallery collection'),
    )
  }
  if (author === '' || author.toLowerCase() === 'unknown') {
    issues.push(issue('author-missing', 'record the public creator credit'))
  }
  if (!PROVENANCE_KINDS.includes(provenance) || provenance === 'unknown') {
    issues.push(
      issue('provenance-unknown', 'record how the work may be redistributed'),
    )
  }
  if (license === '') {
    issues.push(
      issue('license-missing', 'record a license or permission grant'),
    )
  }
  if (licenseUrl !== '' && !isHttpUrl(licenseUrl)) {
    issues.push(issue('license-url-invalid', 'license URL must use http(s)'))
  }

  const thirdParty =
    provenance !== '' &&
    provenance !== 'unknown' &&
    provenance !== 'project-original'
  if (thirdParty && !['gallery', 'motion'].includes(text(row.section))) {
    issues.push(
      issue(
        'credit-surface-missing',
        'third-party work must use a gallery or motion section where public credit is visible',
      ),
    )
  }
  if (thirdParty && !isHttpUrl(sourceUrl)) {
    issues.push(
      issue(
        'source-url-missing',
        'third-party work needs an http(s) source URL',
      ),
    )
  } else if (sourceUrl !== '' && !isHttpUrl(sourceUrl)) {
    issues.push(issue('source-url-invalid', 'source URL must use http(s)'))
  }
  if (thirdParty && text(row.attribution) === '') {
    issues.push(
      issue(
        'attribution-missing',
        'third-party work needs display attribution',
      ),
    )
  }
  if (collection === 'artist' && !thirdParty) {
    issues.push(
      issue(
        'artist-provenance-invalid',
        'Artist Editions must record public-domain, licensed, or permission provenance',
      ),
    )
  }
  if (collection === 'remix') {
    if (text(row.original_id) === '') {
      issues.push(
        issue('original-missing', 'a remix must identify its source work'),
      )
    }
    if (text(row.changes) === '') {
      issues.push(
        issue('changes-missing', 'a remix must describe what changed'),
      )
    }
  }

  return issues
}

export function publicationReadiness(row, { remote }) {
  const issues = publicationIssues(row)
  return remote
    ? { blockers: issues, warnings: [] }
    : { blockers: [], warnings: issues }
}
