import { describe, expect, it, vi } from 'vitest'
// The admin script's own allowlist. Imported rather than restated so the two
// sides of `home_config` cannot drift apart silently — see the test below.
import { CONFIG_KEYS } from '../../scripts/home-config.mjs'
import { DEFAULT_PORTAL_TOUR_ID, fetchHomeConfig, HOME_CONFIG_KEYS, PORTAL_TOUR_ID, resolvePortalTourId, } from './homeConfig'

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
