import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertPosterManifestTarget, assertPosterMatchesRow, galleryContentDigest, mergePosterManifestEntries, POSTER_MANIFEST_VERSION, posterManifestMatchesTarget, } from './gallery-poster-manifest.mjs'

await describe('gallery poster manifests', async () => {
  await it('hashes semantic descriptor content independently of formatting', () => {
    const compact = galleryContentDigest(
      '{"name":"fern","params":{"b":2,"a":1}}',
      '{"fps":30,"frames":[1,2]}',
    )
    const formatted = galleryContentDigest(
      '{\n  "params": { "a": 1, "b": 2 },\n  "name": "fern"\n}',
      '{ "frames": [1, 2], "fps": 30 }',
    )

    assert.equal(formatted, compact)
    assert.notEqual(
      galleryContentDigest('{"name":"carpet"}', '{"fps":30}'),
      compact,
    )
    assert.notEqual(
      galleryContentDigest(
        '{"name":"fern","params":{"b":2,"a":1}}',
        '{"fps":60,"frames":[1,2]}',
      ),
      compact,
    )
  })

  await it('binds a manifest to its exact environment and storage target', () => {
    const manifest = {
      manifestVersion: POSTER_MANIFEST_VERSION,
      env: 'dev',
      storage: 'remote',
    }

    assert.doesNotThrow(() => {
      assertPosterManifestTarget(manifest, {
        env: 'dev',
        storage: 'remote',
      })
    })
    assert.throws(() => {
      assertPosterManifestTarget(manifest, {
        env: 'local',
        storage: 'local',
      })
    }, /targets dev\/remote/u)
    assert.throws(() => {
      assertPosterManifestTarget(
        { env: 'dev', storage: 'remote' },
        { env: 'dev', storage: 'remote' },
      )
    }, /version/u)
    assert.equal(
      posterManifestMatchesTarget(manifest, {
        env: 'dev',
        storage: 'remote',
      }),
      true,
    )
    assert.equal(
      posterManifestMatchesTarget(manifest, {
        env: 'prod',
        storage: 'remote',
      }),
      false,
    )
  })

  await it('only carries entries forward from the same manifest target', () => {
    const existing = {
      manifestVersion: POSTER_MANIFEST_VERSION,
      env: 'dev',
      storage: 'remote',
      posters: [{ slug: 'old' }],
    }
    const fresh = [{ slug: 'new' }]

    assert.deepEqual(
      mergePosterManifestEntries(existing, fresh, {
        env: 'dev',
        storage: 'remote',
      }).map((poster) => poster.slug),
      ['new', 'old'],
    )
    assert.deepEqual(
      mergePosterManifestEntries(existing, fresh, {
        env: 'prod',
        storage: 'remote',
      }).map((poster) => poster.slug),
      ['new'],
    )
  })

  await it('rejects a poster captured from stale gallery content', () => {
    const row = {
      slug: 'barnsley-fern',
      flame: '{"name":"fern"}',
      animation: null,
    }
    const poster = {
      slug: row.slug,
      contentDigest: galleryContentDigest(row.flame, row.animation),
    }

    assert.doesNotThrow(() => {
      assertPosterMatchesRow(poster, row)
    })
    assert.throws(() => {
      assertPosterMatchesRow(poster, {
        ...row,
        flame: '{"name":"fern-v2"}',
      })
    }, /stale/u)
  })
})
