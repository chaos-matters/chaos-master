// The arena's top bar names the arena it stages and draws its streak with an SVG icon.
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { WinnerTrophyCard } from './ArenaResultsView'
import { ArenaTopBar } from './ArenaTopBar'
import type { ArenaTopBarProps } from './ArenaTopBar'

function mountTopBar(overrides: Partial<ArenaTopBarProps> = {}) {
  return render(() => (
    <ArenaTopBar
      winStreak={0}
      gameState="idle"
      rounds={[]}
      activeRoundIndex={0}
      winner={null}
      commentary={null}
      eventBanner={null}
      dimensions={3}
      onReplay={() => {}}
      onClose={() => {}}
      {...overrides}
    />
  ))
}

describe('ArenaTopBar', () => {
  afterEach(() => {
    cleanup()
  })

  it('titles a 2D arena 2D and a 3D arena 3D', () => {
    mountTopBar({ dimensions: 2 })
    expect(screen.getByRole('heading').textContent).toBe('Flame Clash Arena 2D')
    cleanup()
    mountTopBar({ dimensions: 3 })
    expect(screen.getByRole('heading').textContent).toBe('Flame Clash Arena 3D')
  })

  it('draws the streak with an SVG icon, not a text glyph', () => {
    mountTopBar({ winStreak: 2 })
    const badge = screen.getByTitle('Current Arena Win Streak')
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(badge.textContent).toBe('Streak: 2 Wins')
  })
})

describe('WinnerTrophyCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('draws its streak with the same SVG icon as the top bar', () => {
    render(() => (
      <WinnerTrophyCard
        winner={1}
        winStreak={3}
        victorStats={null}
        victorGrounded={null}
        victorPreviewFlame={null}
        previewVersion={0}
        cachedSimResult={null}
        exportingCard={false}
        onNextChallenger={() => {}}
        onReplay={() => {}}
        onLoadVictor={() => {}}
        onExportCard={() => {}}
      />
    ))
    const badge = screen.getByTitle('Current Arena Win Streak')
    expect(badge.querySelector('svg')).not.toBeNull()
    expect(badge.textContent).toBe('Streak: 3 Wins')
  })
})
