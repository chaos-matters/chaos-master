import { afterEach, describe, expect, it, vi } from 'vitest'
// The admin script's own allowlist. Imported rather than restated so the two
// sides of `home_config` cannot drift apart silently — see the test below.
import { CONFIG_KEYS } from '../../scripts/home-config.mjs'
import { DEFAULT_PORTAL_TOUR_ID, fetchHomeConfig, HOME_CONFIG_KEYS, loadHomeConfig, PORTAL_TOUR_ID, resetHomeConfigCache, resolvePortalTourId, } from './homeConfig'

/** Stand-in registry: exactly the ids this test pretends the build has. */
const isKnownTour = (id: string) =>
  ['app', 'example1-creation', 'example2-creation'].includes(id)

describe('resolvePortalTourId', () => {
  it('plays the configured tour when this build has it', () => {
    expect(
      resolvePortalTourId(
        { [PORTAL_TOUR_ID]: 'example2-creation' },
        isKnownTour,
      ),
    ).toBe('example2-creation')
  })

  // Every one of these is a real state: no row, an empty row, settings that
  // could not be fetched, and content naming a tour that was renamed or has not
  // shipped. The portal has to play something in all of them.
  it('falls back when the key is unset', () => {
    expect(resolvePortalTourId({}, isKnownTour)).toBe(DEFAULT_PORTAL_TOUR_ID)
  })

  it('falls back when the settings could not be fetched at all', () => {
    expect(resolvePortalTourId(undefined, isKnownTour)).toBe(
      DEFAULT_PORTAL_TOUR_ID,
    )
  })

  it('falls back on an empty or whitespace value', () => {
    expect(resolvePortalTourId({ [PORTAL_TOUR_ID]: '' }, isKnownTour)).toBe(
      DEFAULT_PORTAL_TOUR_ID,
    )
    expect(resolvePortalTourId({ [PORTAL_TOUR_ID]: '   ' }, isKnownTour)).toBe(
      DEFAULT_PORTAL_TOUR_ID,
    )
  })

  it('falls back on an id this build does not have', () => {
    expect(
      resolvePortalTourId({ [PORTAL_TOUR_ID]: 'no-such-tour' }, isKnownTour),
    ).toBe(DEFAULT_PORTAL_TOUR_ID)
  })

  it('trims a value that was pasted with whitespace', () => {
    expect(
      resolvePortalTourId({ [PORTAL_TOUR_ID]: ' app\n' }, isKnownTour),
    ).toBe('app')
  })

  it('defaults to the tour that rebuilds the hero flame', () => {
    // Phase 5's decision: the portal shows the flame at the top of Home being
    // made. Changing this default changes what every unconfigured deploy plays.
    expect(DEFAULT_PORTAL_TOUR_ID).toBe('example1-creation')
  })
})

describe('the home_config allowlist', () => {
  // The table has no CHECK constraint, so these two lists ARE the schema. A key
  // added on one side only is a setting nothing can write, or one nothing reads.
  it('matches the admin script key for key', () => {
    expect(Object.keys(CONFIG_KEYS).sort()).toEqual(
      [...HOME_CONFIG_KEYS].sort(),
    )
  })
})

describe('fetchHomeConfig', () => {
  it('returns the stored map', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ config: { portal_tour_id: 'app' } })),
        ),
      ),
    )
    await expect(fetchHomeConfig()).resolves.toEqual({ portal_tour_id: 'app' })
    vi.unstubAllGlobals()
  })

  it('treats a response without a config object as empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({})))),
    )
    await expect(fetchHomeConfig()).resolves.toEqual({})
    vi.unstubAllGlobals()
  })

  it('throws on 503 (no content database bound), for the caller to shrug off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 503 }))),
    )
    await expect(fetchHomeConfig()).rejects.toThrow('503')
    vi.unstubAllGlobals()
  })
})

// The portal is mounted and unmounted by SCROLLING — every trip in and out of
// the section is a fresh component. Owning the request per mount meant one
// request and one fallback log per trip; these pin the "at most once per page
// load" that replaced it, failure included.
describe('loadHomeConfig', () => {
  afterEach(() => {
    resetHomeConfigCache()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('fetches once however many callers ask', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ config: { portal_tour_id: 'app' } })),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const [a, b] = await Promise.all([loadHomeConfig(), loadHomeConfig()])
    const c = await loadHomeConfig()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ portal_tour_id: 'app' })
    // The same settled promise, not three copies of the answer.
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  // Concurrent callers must join the request in flight rather than each start
  // one — two mounts inside the same scroll are the ordinary case.
  it('joins a request already in flight', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchMock = vi.fn(() =>
      gate.then(() => new Response(JSON.stringify({ config: {} }))),
    )
    vi.stubGlobal('fetch', fetchMock)

    const first = loadHomeConfig()
    const second = loadHomeConfig()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release?.()
    await Promise.all([first, second])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // The case that actually burned: a 500 retried on every mount, each one
  // logging again. A failure is cached exactly like a success.
  it('caches the failure — no retry, and the fallback is logged once', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response('', { status: 500 })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})

    await loadHomeConfig()
    await loadHomeConfig()
    await loadHomeConfig()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledTimes(1)
  })

  // The contract the portal relies on: no error branch to write, because
  // unreachable settings are not an error state.
  it('never rejects — an unreachable backend resolves to the default tour', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    )
    vi.spyOn(console, 'info').mockImplementation(() => {})

    const config = await loadHomeConfig()
    expect(config).toEqual({})
    expect(resolvePortalTourId(config, isKnownTour)).toBe(
      DEFAULT_PORTAL_TOUR_ID,
    )
  })
})
