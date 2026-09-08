import { createRoot, createSignal } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { awaitExportQueueFence, calculateNextExportIterations, createExportRenderDriver, createInteractiveRenderDriver, EXPORT_INITIAL_ITERATIONS, EXPORT_MAX_ITERATIONS, EXPORT_TARGET_TICK_MS, EXPORT_TICK_GROW_BELOW_MS, EXPORT_TICK_SHRINK_ABOVE_MS, } from './index'

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

    describe('calculateNextExportIterations', () => {
      it('returns unchanged iterations when iterationsRan <= 0 or presented is true', () => {
        expect(calculateNextExportIterations(16, 10, 0, false)).toBe(16)
        expect(calculateNextExportIterations(16, 10, -1, false)).toBe(16)
        expect(calculateNextExportIterations(16, 10, 1, true)).toBe(16)
      })

      it('doubles iteration count when tick is below grow threshold', () => {
        // EXPORT_TICK_GROW_BELOW_MS is 24
        expect(calculateNextExportIterations(16, 20, 1, false)).toBe(32)
        expect(calculateNextExportIterations(400, 10, 1, false)).toBe(
          EXPORT_MAX_ITERATIONS,
        )
      })

      it('creeps upward by 25% when tick is in target band', () => {
        // Between 24 and 48 ms
        expect(calculateNextExportIterations(16, 30, 1, false)).toBe(20) // ceil(16 * 1.25) = 20
        expect(calculateNextExportIterations(500, 35, 1, false)).toBe(
          EXPORT_MAX_ITERATIONS,
        )
      })

      it('shrinks iteration count proportionally when tick exceeds shrink threshold', () => {
        // > 48 ms. Target is 32 ms.
        // ceil(64 * (32 / 64)) = 32
        expect(calculateNextExportIterations(64, 64, 1, false)).toBe(32)
        // Never drops below 1
        expect(calculateNextExportIterations(1, 1000, 1, false)).toBe(1)
      })
    })

    describe('awaitExportQueueFence', () => {
      it('resolves safely when fence promise is undefined', async () => {
        await expect(awaitExportQueueFence(undefined)).resolves.toBeUndefined()
      })

      it('resolves when fence promise resolves', async () => {
        await expect(
          awaitExportQueueFence(Promise.resolve()),
        ).resolves.toBeUndefined()
      })

      it('catches and suppresses fence rejection gracefully', async () => {
        await expect(
          awaitExportQueueFence(
            Promise.reject(new Error('Device lost simulation')),
          ),
        ).resolves.toBeUndefined()
      })
    })
  })
})
