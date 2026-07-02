import { renderHook } from '@solidjs/testing-library'
import { createEffect } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { KeyframeTargetProvider, useKeyframeTarget, } from './KeyframeTargetContext'

// Exercises the real provider + hook rather than a re-implementation of the
// signal logic.
describe('KeyframeTargetContext', () => {
  describe('within a KeyframeTargetProvider', () => {
    it('starts with null target and selection', () => {
      const { result } = renderHook(useKeyframeTarget, {
        wrapper: KeyframeTargetProvider,
      })
      expect(result.targetedParameter()).toBeNull()
      expect(result.selectedKeyframePath()).toBeNull()
    })

    it('reactively tracks the targeted parameter', () => {
      const { result } = renderHook(useKeyframeTarget, {
        wrapper: KeyframeTargetProvider,
      })

      result.setTargetedParameter('camera.zoom')
      expect(result.targetedParameter()).toBe('camera.zoom')

      result.setTargetedParameter('transform.color.x')
      expect(result.targetedParameter()).toBe('transform.color.x')

      result.setTargetedParameter(null)
      expect(result.targetedParameter()).toBeNull()
    })

    it('tracks the selected keyframe path independently of the target', () => {
      const { result } = renderHook(useKeyframeTarget, {
        wrapper: KeyframeTargetProvider,
      })

      result.setTargetedParameter('exposure')
      result.setSelectedKeyframePath('vibrancy')

      expect(result.targetedParameter()).toBe('exposure')
      expect(result.selectedKeyframePath()).toBe('vibrancy')
    })

    it('re-runs a tracking effect when the target changes', () => {
      const { result } = renderHook(useKeyframeTarget, {
        wrapper: KeyframeTargetProvider,
      })

      const seen: (string | null)[] = []
      // renderHook runs inside a reactive owner, so a createEffect here tracks
      // the context signal and re-runs on each change.
      createEffect(() => {
        seen.push(result.targetedParameter())
      })

      result.setTargetedParameter('gamma')
      result.setTargetedParameter('gamma') // same value: no extra run
      result.setTargetedParameter(null)

      expect(seen).toEqual([null, 'gamma', null])
    })
  })

  describe('outside a provider', () => {
    it('returns the deliberate no-op fallback instead of throwing', () => {
      // Standalone controls (Slider, AngleEditor, ScrubInput) are rendered in
      // dialogs with no timeline; the hook degrades gracefully there.
      const { result } = renderHook(useKeyframeTarget)

      expect(result.targetedParameter()).toBeNull()
      expect(result.selectedKeyframePath()).toBeNull()
      // Setters are no-ops: calling them neither throws nor changes state.
      expect(() => {
        result.setTargetedParameter('exposure')
      }).not.toThrow()
      expect(result.targetedParameter()).toBeNull()
    })
  })
})
