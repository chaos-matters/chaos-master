import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duelHudModel } from '@/arcade/duelHud'
import { appendPilotLog, drivingState, resetPilot, startPilot, } from '@/arcade/pilot'
import { DuelNarration } from './DuelNarration'
import { EclipseHud } from './EclipseHud'
import type { DuelVerdict } from '@/arcade/duelJudge'

const verdict = (playerScore: number, rivalScore: number): DuelVerdict => ({
  winner:
    playerScore === rivalScore
      ? 'draw'
      : playerScore > rivalScore
        ? 'player'
        : 'rival',
  playerScore,
  rivalScore,
  line: 'test',
})

/**
 * How many degrees of the ring an arc owns, read back off the path the
 * component actually drew — the arithmetic is the model's and tested there,
 * so what matters here is that the drawing agrees with it.
 */
function sweepOf(path: Element | null | undefined): number {
  const d = path?.getAttribute('d') ?? ''
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (numbers.length < 9) return 0
  const [x1, y1, , , , large, , x2, y2] = numbers
  const angle = (x: number, y: number) =>
    (Math.atan2(y - 232, x - 232) * 180) / Math.PI
  const raw = Math.abs(angle(x2!, y2!) - angle(x1!, y1!))
  const minor = raw > 180 ? 360 - raw : raw
  return large === 1 ? 360 - minor : minor
}

function arcs() {
  // Each side's coloured core is drawn as a run of segments so the hue can
  // travel along the curve; these two carry the full extent of their side.
  return {
    player: sweepOf(document.querySelector('[data-side="player"]')),
    rival: sweepOf(document.querySelector('[data-side="rival"]')),
  }
}

describe('EclipseHud', () => {
  afterEach(() => {
    cleanup()
    resetPilot()
  })

  it('shows the clock', () => {
    render(() => (
      <EclipseHud
        model={duelHudModel({
          remainingMs: 95_000,
          durationMs: 180_000,
          verdict: verdict(62, 38),
        })}
        onEnd={() => {}}
      />
    ))

    expect(screen.getByLabelText('Time remaining').textContent).toBe('1:35')
    // The figures themselves live on the seat name pills now; what the dial
    // carries is the comparison, and the ring tests below measure that.
    expect(screen.queryByText('62')).toBeNull()
  })

  it('gives the leader more of the ring', () => {
    render(() => (
      <EclipseHud
        model={duelHudModel({
          remainingMs: 60_000,
          durationMs: 60_000,
          verdict: verdict(80, 20),
        })}
        onEnd={() => {}}
      />
    ))

    const { player, rival } = arcs()
    expect(player).toBeGreaterThan(rival)
    // Being ahead is owning more of one loop, not filling a bar against a
    // maximum the score does not have — and the two always close one ring,
    // less the gap where they meet.
    expect(player + rival).toBeCloseTo(353, 0)
  })

  it('still draws a sliver for a side that has scored nothing', () => {
    render(() => (
      <EclipseHud
        model={duelHudModel({
          remainingMs: 60_000,
          durationMs: 60_000,
          verdict: verdict(0, 400),
        })}
        onEnd={() => {}}
      />
    ))

    expect(arcs().player).toBeGreaterThan(0)
  })

  it('ends the duel once, however many times it is pressed', () => {
    const onEnd = vi.fn()
    const model = duelHudModel({ remainingMs: 60_000, durationMs: 60_000 })
    const { unmount } = render(() => (
      <EclipseHud model={model} onEnd={onEnd} ending={false} />
    ))
    screen.getByRole('button', { name: 'End the duel' }).click()
    expect(onEnd).toHaveBeenCalledTimes(1)
    unmount()

    render(() => <EclipseHud model={model} onEnd={onEnd} ending={true} />)
    const button = screen.getByRole('button', { name: 'Ending…' })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('says when the AI has declared itself happy', () => {
    render(() => (
      <EclipseHud
        model={duelHudModel({
          remainingMs: 30_000,
          durationMs: 60_000,
          readyTitle: 'Ember lattice',
        })}
        onEnd={() => {}}
      />
    ))

    // It cannot end the duel, so this is the only way the viewer learns that
    // the other side has stopped trying to improve.
    expect(screen.getByText(/Ember lattice/)).toBeTruthy()
  })
})

describe('DuelNarration', () => {
  afterEach(() => {
    cleanup()
    resetPilot()
  })

  it('renders what the AI says, and what it has spent', () => {
    startPilot({
      mode: 'duel',
      title: 'Duel',
      stepBudget: 60,
      allowed: ['flame.'],
      qualityRankAtStart: 1,
      seatId: 'rival',
      lock: 'seat',
    })
    appendPilotLog('narrate', 'Going for something spiral')

    render(() => <DuelNarration driving={drivingState()} />)

    // The prompt card asks the agent to narrate and each call costs a step;
    // before this the output had nowhere to go on a seat-locked screen.
    expect(screen.getByText('Going for something spiral')).toBeTruthy()
    expect(screen.getByText('step 0 of 60')).toBeTruthy()
  })

  it('renders nothing when no one is driving', () => {
    const { container } = render(() => <DuelNarration />)
    expect(container.textContent).toBe('')
  })
})
