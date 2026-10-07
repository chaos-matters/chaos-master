/**
 * Load Candidate writes a Director candidate into the user's document, so it
 * writes only a flame the schema accepts. director_propose validates what an
 * agent sends; this is the second gate, for a state set any other way.
 */
import { createRoot } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tryValidateFlame } from '@/flame/schema/flameSchema'
import { deepClone } from '@/utils/clone'
import { createTestFlame } from '@/webmcp/testUtils'
import { useWorkspaceArtDirector } from './useWorkspaceArtDirector'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// The overlay renders previews through WebGPU; Load Candidate needs neither.
vi.mock('@/components/Modal/ModalContext', () => ({
  useRequestModal: () => () => Promise.resolve(),
}))
vi.mock('@/components/DirectorOverlay', () => ({
  DirectorOverlay: () => null,
}))

let dispose: (() => void) | undefined

function mountDirector() {
  const setFlameDescriptor = vi.fn()
  const showToast = vi.fn()
  const director = createRoot((d) => {
    dispose = d
    return useWorkspaceArtDirector({
      flameDescriptor: createTestFlame(),
      setFlameDescriptor,
      showToast,
    })
  })
  return { director, setFlameDescriptor, showToast }
}

/** What the document holds after the updater the hook handed over runs. */
function written(setFlameDescriptor: ReturnType<typeof vi.fn>) {
  const updater = setFlameDescriptor.mock.calls[0]?.[0] as
    | ((draft: FlameDescriptor) => FlameDescriptor)
    | undefined
  return updater?.(createTestFlame())
}

afterEach(() => {
  dispose?.()
  dispose = undefined
})

describe('useWorkspaceArtDirector Load Candidate', () => {
  it('loads a candidate as the schema reads it', () => {
    const { director, setFlameDescriptor } = mountDirector()
    const flame = createTestFlame()
    director.setDirectorState({
      sessionId: 's',
      generation: 1,
      candidates: [{ flame, fitness: 0.5 }],
    })

    director.selectCandidate(0)

    expect(setFlameDescriptor).toHaveBeenCalledTimes(1)
    expect(written(setFlameDescriptor)).toEqual(
      tryValidateFlame(deepClone(flame)),
    )
    expect(director.directorState()?.lastFeedback?.selectedIndex).toBe(0)
  })

  it('leaves the document alone for a candidate the schema rejects', () => {
    const { director, setFlameDescriptor, showToast } = mountDirector()
    const hostile = createTestFlame()
    hostile.renderSettings.skipIters = 1_000_000_000
    director.setDirectorState({
      sessionId: 's',
      generation: 1,
      candidates: [{ flame: hostile, fitness: 0.5 }],
    })

    director.selectCandidate(0)

    expect(setFlameDescriptor).not.toHaveBeenCalled()
    expect(showToast).toHaveBeenCalledWith(
      'Art Director: Candidate 1 is not a flame the editor can open.',
    )
    expect(director.directorState()?.lastFeedback).toBeUndefined()
  })
})
