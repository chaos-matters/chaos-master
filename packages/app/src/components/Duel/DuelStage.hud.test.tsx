// The split screen's live scores are the verdict's scores, on the verdict's scale.
import { cleanup, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { duelActive, startDuel, stopDuel } from '@/arcade/duel'
import { duelJudge, scoreSheetJudge } from '@/arcade/duelJudge'
import { resetPilot } from '@/arcade/pilot'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { DuelStage } from './DuelStage'
import type { v2f } from 'typegpu/data'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// The seats mount WebGPU canvases; the stub prints the score each seat is given,
// which is the number the viewer reads under each flame.
vi.mock('./SeatView', () => ({
  SeatView: (props: { side: string; score: number }) => (
    <output data-testid={`seat-${props.side}`}>{props.score}</output>
  ),
}))

function brighter(flame: FlameDescriptor): FlameDescriptor {
  return {
    ...flame,
    renderSettings: { ...flame.renderSettings, exposure: 1.5 },
  }
}

describe('DuelStage live score', () => {
  afterEach(() => {
    cleanup()
    if (duelActive()) stopDuel()
    resetPilot()
  })

  it('shows the verdict judge, so the HUD and the result card agree', () => {
    const player = brighter(createTestFlame())
    const rival = createTestFlame()
    startDuel({
      rivalFlame: rival,
      playerFlame: player,
      durationMs: 60_000,
      recording: 'none',
      now: 0,
    })
    const expected = duelJudge.judge(player, rival)
    // The fixture must tell the two judges apart, or the test proves nothing.
    expect(scoreSheetJudge.judge(player, rival).playerScore).not.toBe(
      expected.playerScore,
    )

    render(() => (
      <DuelStage
        ctx={createMockCommandContext()}
        playerFlame={() => player}
        playerZoom={createSignal(1)}
        playerPosition={createSignal({ x: 0, y: 0 } as unknown as v2f)}
        playerCamera3D={{} as never}
        quality={1}
        adaptiveFilter={false}
        stochasticFilter={false}
        sidebarWidthRem={() => 0}
      />
    ))

    expect(Number(screen.getByTestId('seat-player').textContent)).toBe(
      expected.playerScore,
    )
    expect(Number(screen.getByTestId('seat-rival').textContent)).toBe(
      expected.rivalScore,
    )
  })
})
