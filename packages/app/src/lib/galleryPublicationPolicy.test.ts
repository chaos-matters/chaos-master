import { describe, expect, it } from 'vitest'
import { publicationReadiness } from '../../scripts/gallery-publication-policy.mjs'

const ready = (over: Record<string, unknown> = {}) => ({
  author: 'Lumen Apeiron',
  collection: 'original',
  provenance_kind: 'project-original',
  source_url: null,
  license: 'AGPL-3.0-only',
  license_url: 'https://example.test/license',
  attribution: 'Created by Lumen Apeiron',
  changes: null,
  original_id: null,
  poster_key: 'flame-abcd.webp',
  poster_width: 1600,
  poster_height: 900,
  poster_frame: null,
  has_animation: 0,
  section: 'gallery',
  ...over,
})

describe('gallery publication policy', () => {
  it('accepts a complete project-original row', () => {
    expect(publicationReadiness(ready(), { remote: true })).toEqual({
      blockers: [],
      warnings: [],
    })
  })

  it('turns the same incomplete metadata into local warnings or remote blockers', () => {
    const row = ready({
      author: 'unknown',
      provenance_kind: 'unknown',
      license: null,
      poster_key: null,
    })
    const local = publicationReadiness(row, { remote: false })
    const remote = publicationReadiness(row, { remote: true })

    expect(local.blockers).toEqual([])
    expect(local.warnings.map((entry: { code: string }) => entry.code)).toEqual(
      expect.arrayContaining([
        'poster-missing',
        'author-missing',
        'provenance-unknown',
        'license-missing',
      ]),
    )
    expect(remote.blockers).toEqual(local.warnings)
  })

  it('requires public credit and rights metadata for an Artist Edition', () => {
    const result = publicationReadiness(
      ready({ collection: 'artist', provenance_kind: 'project-original' }),
      { remote: true },
    )
    expect(
      result.blockers.map((entry: { code: string }) => entry.code),
    ).toContain('artist-provenance-invalid')

    expect(
      publicationReadiness(
        ready({
          collection: 'artist',
          provenance_kind: 'licensed',
          source_url: 'https://artist.example/work',
          attribution: 'Work by Example Artist',
        }),
        { remote: true },
      ).blockers,
    ).toEqual([])
  })

  it('requires a source identity and changes for remixes', () => {
    const result = publicationReadiness(ready({ collection: 'remix' }), {
      remote: true,
    })
    expect(
      result.blockers.map((entry: { code: string }) => entry.code),
    ).toEqual(expect.arrayContaining(['original-missing', 'changes-missing']))
  })

  it('requires an animated poster to record its frame', () => {
    const result = publicationReadiness(ready({ has_animation: 1 }), {
      remote: true,
    })
    expect(
      result.blockers.map((entry: { code: string }) => entry.code),
    ).toContain('poster-frame-missing')
  })

  it('requires positive integer poster dimensions', () => {
    for (const dimensions of [
      { poster_width: null },
      { poster_width: 0 },
      { poster_height: -1 },
      { poster_height: 900.5 },
    ]) {
      const result = publicationReadiness(ready(dimensions), { remote: true })
      expect(
        result.blockers.map((entry: { code: string }) => entry.code),
      ).toContain('poster-dimensions-invalid')
    }
  })

  it('keeps third-party work on surfaces that display public credit', () => {
    const thirdParty = {
      collection: 'artist',
      provenance_kind: 'licensed',
      source_url: 'https://artist.example/work',
      attribution: 'Work by Example Artist',
    }

    for (const section of ['hero', 'capability']) {
      const result = publicationReadiness(ready({ ...thirdParty, section }), {
        remote: true,
      })
      expect(
        result.blockers.map((entry: { code: string }) => entry.code),
      ).toContain('credit-surface-missing')
    }

    for (const section of ['gallery', 'motion']) {
      expect(
        publicationReadiness(ready({ ...thirdParty, section }), {
          remote: true,
        }).blockers,
      ).toEqual([])
    }
  })
})
