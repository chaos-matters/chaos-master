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

function arcs() {
  const svg = document.querySelector('svg')
  const [, , player, rival] = Array.from(svg?.querySelectorAll('circle') ?? [])
  const length = (el: Element | undefined) =>
    Number(el?.getAttribute('stroke-dasharray')?.split(' ')[0] ?? '0')
  return { player: length(player), rival: length(rival) }
}

describe('EclipseHud', () => {
  afterEach(() => {
    cleanup()
    resetPilot()
  })

  it('shows the clock and both scores', () => {
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
    expect(screen.getByText('62')).toBeTruthy()
    expect(screen.getByText('38')).toBeTruthy()
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
    // maximum the score does not have.
    expect(player + rival).toBeLessThanOrEqual(2 * Math.PI * 46)
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
