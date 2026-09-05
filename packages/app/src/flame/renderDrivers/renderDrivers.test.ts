import { createRoot, createSignal } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { createExportRenderDriver, createInteractiveRenderDriver, EXPORT_INITIAL_ITERATIONS, EXPORT_MAX_ITERATIONS, EXPORT_TARGET_TICK_MS, EXPORT_TICK_GROW_BELOW_MS, EXPORT_TICK_SHRINK_ABOVE_MS, } from './index'

describe('renderDrivers', () => {
  describe('createInteractiveRenderDriver', () => {
    it('sets up a requestAnimationFrame loop that can request frames', () => {
      createRoot((dispose) => {
        const renderTick = vi.fn().mockReturnValue({
          iterations: 1,
          presented: true,
          hadWork: true,
        })
        const [gpuReady] = createSignal(true)
        const [exportActive] = createSignal(false)
        const [interval] = createSignal(16)
        const presentToCanvas = vi.fn()

        const driver = createInteractiveRenderDriver({
          renderTick,
          renderInterval: interval,
          continueRendering: () => true,
          latestQueueFence: () => Promise.resolve(),
          exportDriverActive: exportActive,
          gpuReady,
          presentToCanvas,
          isAppleWebKit: () => false,
        })

        expect(typeof driver.redraw).toBe('function')
        expect(() => {
          driver.redraw()
        }).not.toThrow()
        dispose()
      })
    })

    it('triggers onStallResumed when interval transitions from Infinity to finite', async () => {
      await new Promise<void>((resolve) => {
        createRoot((dispose) => {
          const renderTick = vi.fn().mockReturnValue({
            iterations: 1,
            presented: true,
            hadWork: true,
          })
          const [interval, setInterval] = createSignal(Infinity)
          const onStallResumed = vi.fn()

          createInteractiveRenderDriver({
            renderTick,
            renderInterval: interval,
            continueRendering: () => true,
            latestQueueFence: () => Promise.resolve(),
            exportDriverActive: () => false,
            gpuReady: () => true,
            presentToCanvas: () => {},
            isAppleWebKit: () => false,
            onStallResumed,
          })

          expect(onStallResumed).not.toHaveBeenCalled()
          setInterval(16)

          setTimeout(() => {
            expect(onStallResumed).toHaveBeenCalledTimes(1)
            dispose()
            resolve()
          }, 10)
        })
      })
    })
  })

  describe('createExportRenderDriver', () => {
    it('starts with initial iterations and provides wake handle', () => {
      createRoot((dispose) => {
        const [exportActive] = createSignal(false)
        const driver = createExportRenderDriver({
          exportDriverActive: exportActive,
          gpuReady: () => true,
          renderTick: vi.fn().mockReturnValue({
            iterations: 1,
            presented: false,
            hadWork: true,
          }),
          latestQueueFence: () => Promise.resolve(),
          pointCountPerBatch: () => 1000,
          plotsPerChainBaked: () => 1,
        })

        expect(driver.getExportIterationCount()).toBe(EXPORT_INITIAL_ITERATIONS)
        expect(typeof driver.wake).toBe('function')
        expect(() => {
          driver.wake()
        }).not.toThrow()
        dispose()
      })
    })

    it('exports the expected controller thresholds', () => {
      expect(EXPORT_TARGET_TICK_MS).toBe(32)
      expect(EXPORT_TICK_GROW_BELOW_MS).toBe(24)
      expect(EXPORT_TICK_SHRINK_ABOVE_MS).toBe(48)
      expect(EXPORT_MAX_ITERATIONS).toBe(512)
    })
  })
})
