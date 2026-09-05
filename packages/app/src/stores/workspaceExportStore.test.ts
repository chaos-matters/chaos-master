import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createWorkspaceExportStore } from './workspaceExportStore'

describe('workspaceExportStore', () => {
  it('initializes with default quality and resolution', () => {
    createRoot((dispose) => {
      const store = createWorkspaceExportStore()
      expect(typeof store.qualityPreset()).toBe('string')
      expect(store.pixelRatio()).toBeGreaterThan(0)
      expect(store.exportDimensions()).toBeUndefined()
      expect(store.canvasPixelRatio()).toBe(store.pixelRatio())
      dispose()
    })
  })

  it('sets canvasPixelRatio to 1 when exportDimensions are set', () => {
    createRoot((dispose) => {
      const store = createWorkspaceExportStore()
      store.setPixelRatio(2)
      expect(store.canvasPixelRatio()).toBe(2)

      store.setExportDimensions({ width: 1920, height: 1080 })
      expect(store.canvasPixelRatio()).toBe(1)

      store.setExportDimensions(undefined)
      expect(store.canvasPixelRatio()).toBe(2)
      dispose()
    })
  })

  it('manages filter and image export callbacks', () => {
    createRoot((dispose) => {
      const store = createWorkspaceExportStore()
      expect(store.adaptiveFilterEnabled()).toBe(true)
      store.setAdaptiveFilterEnabled(false)
      expect(store.adaptiveFilterEnabled()).toBe(false)

      expect(store.stochasticFilterEnabled()).toBe(false)
      store.setStochasticFilterEnabled(true)
      expect(store.stochasticFilterEnabled()).toBe(true)
      dispose()
    })
  })
})
