import { describe, expect, it, vi } from 'vitest'
import worker from './index'
import type { Env } from './index'

// ── Hand-mocked bindings (no Miniflare needed) ──────────────────────────────
function makeKv() {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    put: vi.fn((k: string, v: string) => {
      store.set(k, v)
      return Promise.resolve()
    }),
  }
}

function makeR2() {
  const store = new Map<string, Uint8Array>()
  return {
    store,
    head: vi.fn((k: string) =>
      Promise.resolve(store.has(k) ? { key: k } : null),
    ),
    put: vi.fn((k: string, v: Uint8Array) => {
      store.set(k, v)
      return Promise.resolve()
    }),
    get: vi.fn((k: string) =>
      Promise.resolve(store.has(k) ? { body: store.get(k) } : null),
    ),
  }
}
const passLimiter = { limit: vi.fn(() => Promise.resolve({ success: true })) }

function makeEnv(over: Partial<Env> = {}): Env {
  return {
    KV_SHORTENER: makeKv(),
    OG_IMAGES: makeR2(),
    API_RL: passLimiter,
    DISCORD_RL: passLimiter,
    ASSETS: {
      fetch: () =>
        Promise.resolve(
          new Response(
            '<html><head><title>old</title></head><body></body></html>',
            { headers: { 'Content-Type': 'text/html' } },
          ),
        ),
    },
    ...over,
  }
}

const ctx = {}
// Base64 of the 8-byte PNG signature — passes the `iVBORw0KGgo` prefix check.
const PNG = btoa(
  String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
)
const KEY = 'a'.repeat(32)
const post = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', body: JSON.stringify(body) })

// Mirror of the Worker's `ogKey` so a test can address the same content key.
async function ogKey(encoded: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(encoded),
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

describe('worker /api/og — S-1 OG integrity', () => {
  it('rejects a non-hex key with 400', async () => {
    const res = await worker.fetch(
      post('https://x.test/api/og/not-a-key', { image: PNG }),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('rejects a non-PNG image with 415', async () => {
    const res = await worker.fetch(
      post(`https://x.test/api/og/${KEY}`, { image: btoa('not a png') }),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(415)
  })

  it('is immutable: first write stores, second is deduped (not overwritten)', async () => {
    const env = makeEnv()
    const r2 = env.OG_IMAGES as ReturnType<typeof makeR2>
    const first = await worker.fetch(
      post(`https://x.test/api/og/${KEY}`, { image: PNG, title: 'A' }),
      env,
      ctx,
    )
    expect(first.status).toBe(200)
    expect(r2.put).toHaveBeenCalledTimes(1)

    const second = await worker.fetch(
      post(`https://x.test/api/og/${KEY}`, { image: PNG, title: 'EVIL' }),
      env,
      ctx,
    )
    expect(second.status).toBe(200)
    expect((await second.json()) as { deduped?: boolean }).toMatchObject({
      deduped: true,
    })
    expect(r2.put).toHaveBeenCalledTimes(1) // never overwritten
  })
})

describe('worker /api/shorten — S-2 payload cap', () => {
  it('shortens a valid payload', async () => {
    const res = await worker.fetch(
      post('https://x.test/api/shorten', { payload: 'abc' }),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(200)
    expect(((await res.json()) as { id: string }).id).toMatch(
      /^[A-Za-z0-9]{8}$/,
    )
  })

  it('rejects an over-cap payload with 413', async () => {
    const res = await worker.fetch(
      post('https://x.test/api/shorten', {
        payload: 'x'.repeat(256 * 1024 + 1),
      }),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(413)
  })

  it('rejects an empty payload with 400', async () => {
    const res = await worker.fetch(
      post('https://x.test/api/shorten', { payload: '' }),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(400)
  })

  it('fails open when the rate limiter throws — S-4 fail-open', async () => {
    const env = makeEnv({
      API_RL: {
        limit: () => {
          throw new Error('rate limiter down')
        },
      },
    })
    const res = await worker.fetch(
      post('https://x.test/api/shorten', { payload: 'abc' }),
      env,
      ctx,
    )
    expect(res.status).toBe(200)
  })
})

describe('worker — S-3 security headers', () => {
  it('sets nosniff and an enforced CSP (with unsafe-eval for TypeGPU) on responses', async () => {
    const res = await worker.fetch(
      post('https://x.test/api/shorten', { payload: 'abc' }),
      makeEnv(),
      ctx,
    )
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const csp = res.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("'unsafe-eval'")
  })
})

describe('worker OG meta injection — XSS escaping guard', () => {
  it('escapes a crafted OG title in the rendered <head>', async () => {
    const env = makeEnv()
    const kv = env.KV_SHORTENER as ReturnType<typeof makeKv>
    const flame = 'payload-123'
    kv.store.set(
      `og:${await ogKey(flame)}`,
      JSON.stringify({
        t: '</title><script>alert(1)</script>',
        d: 'd',
        img: 0,
      }),
    )
    const res = await worker.fetch(
      new Request(`https://x.test/?flame=${flame}`),
      env,
      ctx,
    )
    const html = await res.text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ── Home gallery content (D1) ───────────────────────────────────────────────
// A minimal stand-in for the D1 binding: records the SQL and bound params so a
// test can assert the query shape without a real database.
function makeD1(rows: Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = []
  return {
    calls,
    prepare(sql: string) {
      const call = { sql, params: [] as unknown[] }
      calls.push(call)
      const stmt = {
        bind(...params: unknown[]) {
          call.params = params
          return stmt
        },
        all: () => Promise.resolve({ results: rows }),
        first: () => Promise.resolve(rows[0] ?? null),
      }
      return stmt
    },
  }
}

const galleryRow = {
  slug: 'first-light',
  title: 'First Light',
  caption: null,
  author: 'unknown',
  section: 'hero',
  capability: null,
  flame: JSON.stringify({ transforms: { t1: {} } }),
  animation: null,
  dimensions: 2,
  transform_count: 4,
  poster_key: null,
  poster_width: null,
  poster_height: null,
}

describe('worker /api/gallery', () => {
  it('returns 503 when no content database is bound', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/gallery'),
      makeEnv(),
      ctx,
    )
    expect(res.status).toBe(503)
  })

  it('lists published items and omits the flame descriptors', async () => {
    const db = makeD1([galleryRow])
    const res = await worker.fetch(
      new Request('https://x.test/api/gallery'),
      makeEnv({ CONTENT_DB: db }),
      ctx,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: Record<string, unknown>[] }
    expect(body.items).toHaveLength(1)
    // The list endpoint must stay small — descriptors are fetched per item.
    expect(db.calls[0]?.sql).not.toContain('flame,')
    expect(db.calls[0]?.sql).toContain('published = 1')
    expect(res.headers.get('Cache-Control')).toContain('max-age=')
  })

  it('filters by section and rejects an unknown one', async () => {
    const db = makeD1([galleryRow])
    const ok = await worker.fetch(
      new Request('https://x.test/api/gallery?section=motion'),
      makeEnv({ CONTENT_DB: db }),
      ctx,
    )
    expect(ok.status).toBe(200)
    expect(db.calls[0]?.params).toEqual(['motion'])

    const bad = await worker.fetch(
      new Request('https://x.test/api/gallery?section=; DROP TABLE'),
      makeEnv({ CONTENT_DB: makeD1([]) }),
      ctx,
    )
    expect(bad.status).toBe(400)
  })

  it('parses the stored JSON when returning a single item', async () => {
    const db = makeD1([
      { ...galleryRow, animation: JSON.stringify({ tracks: [] }) },
    ])
    const res = await worker.fetch(
      new Request('https://x.test/api/gallery/first-light'),
      makeEnv({ CONTENT_DB: db }),
      ctx,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      flame: { transforms: Record<string, unknown> }
      animation: { tracks: unknown[] }
    }
    // Clients must receive objects, not strings needing a second decode.
    expect(body.flame.transforms).toHaveProperty('t1')
    expect(body.animation.tracks).toEqual([])
    expect(db.calls[0]?.params).toEqual(['first-light'])
  })

  it('rejects a malformed slug before it reaches the query', async () => {
    const db = makeD1([galleryRow])
    const res = await worker.fetch(
      new Request('https://x.test/api/gallery/Bad_Slug!'),
      makeEnv({ CONTENT_DB: db }),
      ctx,
    )
    expect(res.status).toBe(400)
    expect(db.calls).toHaveLength(0)
  })

  it('404s an unpublished or unknown slug', async () => {
    const res = await worker.fetch(
      new Request('https://x.test/api/gallery/nope'),
      makeEnv({ CONTENT_DB: makeD1([]) }),
      ctx,
    )
    expect(res.status).toBe(404)
  })
})
