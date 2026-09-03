import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { ReplayAgentRail } from './ReplayAgentRail'
import type { RecordedAction } from '@/recorder/schema'

const ACTIONS: RecordedAction[] = [
  { t: 0, id: 'lesson.note', args: ['Watch the arms thin out.'] },
  { t: 1, id: 'flame.setSkipIters', args: [60], label: 'Set skip iterations' },
  { t: 2, id: 'camera.zoomTo', args: [3], label: 'Zoom To' },
]

describe('ReplayAgentRail', () => {
  afterEach(cleanup)

  it('reveals only the steps the replay has reached', () => {
    render(() => <ReplayAgentRail actions={ACTIONS} stepIndex={1} />)

    expect(screen.getByText('Set skip iterations')).toBeTruthy()
    // A rail that shows the whole lesson at step one spoils every beat.
    expect(screen.queryByText('Zoom To')).toBeNull()
  })

  it('prefers an authored caption over the derived label', () => {
    const withNote: RecordedAction[] = [
      { ...ACTIONS[1]!, note: 'More skipped iterations, cleaner arms.' },
    ]
    render(() => <ReplayAgentRail actions={withNote} stepIndex={0} />)

    expect(
      screen.getByText('More skipped iterations, cleaner arms.'),
    ).toBeTruthy()
    expect(screen.queryByText('Set skip iterations')).toBeNull()
  })

  it('says so before the first step rather than rendering an empty box', () => {
    render(() => <ReplayAgentRail actions={ACTIONS} stepIndex={-1} />)

    expect(screen.getByText('Waiting for the first step.')).toBeTruthy()
  })

  it('falls back to the command id when a step carries neither', () => {
    render(() => (
      <ReplayAgentRail
        actions={[{ t: 0, id: 'flame.randomize', args: [] }]}
        stepIndex={0}
      />
    ))

    expect(screen.getByText('flame.randomize')).toBeTruthy()
  })
})
