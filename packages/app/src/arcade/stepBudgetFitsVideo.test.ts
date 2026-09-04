import { describe, expect, it } from 'vitest'
import { createReplayVideoSchedule, MAX_REPLAY_VIDEO_DURATION_MS, } from '@/recorder/replayVideo'
import { CINEMA_STEP_BUDGET, LESSON_TOPICS } from './topics'
import type { RecordedAction, RecordedSession } from '@/recorder/schema'

/**
 * A step budget is really a video budget.
 *
 * An agent that fills its budget produces a take, and a take that will not
 * export is worse than one step fewer: the lesson exists but nobody can watch
 * it away from the editor. The two numbers live in different files, so this
 * holds them together — raise a budget past what the encoder will accept and
 * this fails rather than the user's export.
 *
 * The mix is measured, not invented. The Barnsley Fern lesson an agent
 * recorded on 2026-09-04 spent 10 of its 22 steps on narration, at about
 * twenty words each — long enough to hit the narration hold ceiling.
 */
const NARRATION_SHARE = 0.5
const SENTENCE =
  'Colour speed decides how fast a point commits to the palette, and the body transform runs most of the time here.'

function worstRealisticTake(steps: number): RecordedSession {
  const actions: RecordedAction[] = []
  for (let i = 0; i < steps; i++) {
    actions.push(
      i % 2 === 0 &&
        actions.filter((a) => a.id === 'lesson.note').length <
          Math.round(steps * NARRATION_SHARE)
        ? { t: i * 1000, id: 'lesson.note', args: [SENTENCE] }
        : { t: i * 1000, id: 'flame.setGamma', args: [2.2 + i / 100] },
    )
  }
  return { version: 1, actions } as unknown as RecordedSession
}

describe('step budgets fit inside a replay video', () => {
  const budgets = [
    ...Object.values(LESSON_TOPICS).map(
      (topic) => [topic.id, topic.stepBudget] as const,
    ),
    ['cinema', CINEMA_STEP_BUDGET] as const,
  ]

  for (const [id, steps] of budgets) {
    it(`${id} (${steps} steps) exports at 1x`, () => {
      const { durationMs } = createReplayVideoSchedule(
        worstRealisticTake(steps),
      )
      expect(durationMs).toBeLessThanOrEqual(MAX_REPLAY_VIDEO_DURATION_MS)
    })
  }

  it('leaves room for a take that runs over the usual mix', () => {
    // Not a knife-edge: the largest budget should still fit with a quarter of
    // the cap to spare, or the first chatty agent hits the wall.
    const largest = Math.max(...budgets.map(([, steps]) => steps))
    const { durationMs } = createReplayVideoSchedule(
      worstRealisticTake(largest),
    )
    expect(durationMs).toBeLessThanOrEqual(MAX_REPLAY_VIDEO_DURATION_MS * 0.75)
  })
})
