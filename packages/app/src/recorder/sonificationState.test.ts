import { describe, expect, it } from 'vitest'
import { shouldRevealSonificationAfterReplay, shouldStopHiddenSonification, } from './sonificationState'

describe('sonification visibility policy', () => {
  it('preserves enabled output through replay focus and reveals its stop control afterwards', () => {
    let enabled = true
    let panelVisible = false

    if (
      shouldStopHiddenSonification({
        enabled,
        panelVisible,
        keepPlayingWhenClosed: false,
        replayPreservesOutput: true,
      })
    ) {
      enabled = false
    }
    expect(enabled).toBe(true)

    if (
      shouldRevealSonificationAfterReplay({
        enabled,
        panelVisible,
        keepPlayingWhenClosed: false,
      })
    ) {
      panelVisible = true
    }

    expect(panelVisible).toBe(true)
    expect(
      shouldStopHiddenSonification({
        enabled,
        panelVisible,
        keepPlayingWhenClosed: false,
        replayPreservesOutput: false,
      }),
    ).toBe(false)
    expect(enabled).toBe(true)
  })
})
