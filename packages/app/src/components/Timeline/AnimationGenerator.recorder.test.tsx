import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import * as timelineActions from '@/recorder/timelineActions'
import { AnimationControls, AnimationGenerator } from './AnimationGenerator'
import type { TimelineState } from '@/utils/timeline'

function timelineHarness() {
  const runWithSingleUndo = vi.fn((_mutation: () => unknown) => undefined)
  const clearAllTracks = vi.fn()
  return {
    timeline: {
      runWithSingleUndo,
      clearAllTracks,
    } as unknown as TimelineState,
    clearAllTracks,
    runWithSingleUndo,
  }
}

describe('animation UI recorder boundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('routes Colors and Clear through the recorder-aware timeline facade', () => {
    const harness = timelineHarness()
    const snapshotMutation = vi.spyOn(
      timelineActions,
      'runTimelineSnapshotMutation',
    )
    render(() => (
      <AnimationControls
        flameDescriptor={examples.example1}
        timeline={harness.timeline}
        presetsExpanded={false}
        onTogglePresets={vi.fn()}
      />
    ))

    fireEvent.click(
      screen.getByTitle(
        'Generate random color keyframes for transforms and palette',
      ),
    )
    expect(snapshotMutation).toHaveBeenCalledWith(
      harness.timeline,
      { kind: 'timeline.colors' },
      expect.any(Function),
    )
    expect(harness.runWithSingleUndo).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTitle('Clear all keyframes (undoable)'))
    expect(harness.clearAllTracks).toHaveBeenCalledOnce()
  })

  it('routes a visible preset through one recorder-aware snapshot mutation', () => {
    const harness = timelineHarness()
    const snapshotMutation = vi.spyOn(
      timelineActions,
      'runTimelineSnapshotMutation',
    )
    render(() => (
      <AnimationGenerator
        flameDescriptor={examples.example1}
        timeline={harness.timeline}
        expanded
      />
    ))

    fireEvent.click(screen.getByTitle('Zoom In'))
    expect(snapshotMutation).toHaveBeenCalledWith(
      harness.timeline,
      { kind: 'timeline.preset', detail: 'Zoom In' },
      expect.any(Function),
    )
    expect(harness.runWithSingleUndo).toHaveBeenCalledOnce()
  })
})
