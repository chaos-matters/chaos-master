import { afterEach, describe, expect, it, vi } from 'vitest'
import { ogKey, shortenShareUrl } from './shareLink'

describe('ogKey', () => {
  it('is the first 32 hex chars of SHA-256(payload) — must match the Worker', async () => {
    // Golden vector: SHA-256("test") =
    // 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
    expect(await ogKey('test')).toBe('9f86d081884c7d659a2feaa0c55ad015')
  })

  it('is deterministic and 32 lowercase hex chars', async () => {
    const k = await ogKey('hello world')
    expect(k).toMatch(/^[0-9a-f]{32}$/)
    expect(await ogKey('hello world')).toBe(k)
  })
})

describe('shortenShareUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a /?s= link on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ id: 'abc123' }), { status: 200 }),
        ),
      ),
    )
    expect(await shortenShareUrl('payload')).toMatch(/\/\?s=abc123$/)
  })

  it('returns an empty string when the shortener responds non-OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))),
    )
    expect(await shortenShareUrl('payload')).toBe('')
  })

  it('returns an empty string on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    expect(await shortenShareUrl('payload')).toBe('')
  })
})
