/**
 * A `#tour=` link starts its tour once. The hash effect reads whether this
 * layout offers tours (tours/offered.ts); read tracked, a flip of the layout
 * re-ran the effect and restarted the linked tour at step 1.
 */
import { createRoot } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setTouchLayoutPreference } from './stores/workspaceLayoutStore'
import type * as TourContextModule from './contexts/SpotlightTourContext'

const startTour = vi.hoisted(() => vi.fn<(id: string) => void>())
vi.mock('./contexts/SpotlightTourContext', async (importOriginal) => {
  const real = await importOriginal<typeof TourContextModule>()
  return {
    ...real,
    createSpotlightTourState: (
      ...args: Parameters<typeof real.createSpotlightTourState>
    ) => {
      const state = real.createSpotlightTourState(...args)
      return {
        ...state,
        startTour: (id: string) => {
          startTour(id)
          state.startTour(id)
        },
      }
    },
  }
})

const { Wrappers } = await import('./App')

describe('a #tour= link', () => {
  let dispose: (() => void) | undefined
  beforeEach(() => {
    // Constructing the app logs what happy-dom lacks (WebGPU, IndexedDB);
    // App.integration.test.tsx says why that noise is expected.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.replaceState(null, '', '/#tour=app')
    setTouchLayoutPreference('desktop')
  })
  afterEach(() => {
    dispose?.()
    setTouchLayoutPreference('auto')
    window.history.replaceState(null, '', '/')
    vi.restoreAllMocks()
    startTour.mockClear()
  })

  it('starts its tour once, however often the layout flips after', () => {
    createRoot((d) => {
      dispose = d
      Wrappers()
    })
    expect(startTour).toHaveBeenCalledExactlyOnceWith('app')

    setTouchLayoutPreference('touch')
    setTouchLayoutPreference('desktop')

    expect(startTour).toHaveBeenCalledOnce()
  })
})
