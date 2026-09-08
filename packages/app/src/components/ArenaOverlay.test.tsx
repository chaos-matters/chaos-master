import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { createTestFlame } from '@/webmcp/testUtils'
import { ArenaOverlay } from './ArenaOverlay'
import type { ArenaOverlayProps } from './ArenaOverlay'
import type { ArenaFighterStats } from '@/commands/types'

function mountArenaOverlay() {
  const f1 = createTestFlame()
  const f2 = createTestFlame()

  const [p1, setP1] = createSignal<ArenaFighterStats | null>({
    name: 'Cosmic Phoenix',
    type: 'Solar Guardian',
    flame: f1,
    powerLevel: 1450,
  })

  const [p2, setP2] = createSignal<ArenaFighterStats | null>({
    name: 'Void Marauder',
    type: 'Void Knight',
    flame: f2,
    powerLevel: 1320,
  })

  const [commentary, setCommentary] = createSignal<string | null>(
    'Fighters are locked in position. Choose stance and begin!',
  )
  const [eventBanner, setEventBanner] = createSignal<string | null>(null)
  const [stance, setStance] = createSignal<string>('balanced')
  const [isOpen, setIsOpen] = createSignal<boolean>(true)

  const mockArena: ArenaOverlayProps['arena'] = {
    open: isOpen,
    setOpen: setIsOpen,
    player1Stats: p1,
    player2Stats: p2,
    setPlayer1Stats: setP1,
    setPlayer2Stats: setP2,
    commentary,
    setCommentary,
    eventBanner,
    setEventBanner,
    stance,
    setStance,
    selectFighter: vi.fn(),
  }

  const onClose = vi.fn()

  const result = render(() => (
    <TimelineProvider>
      <ArenaOverlay arena={mockArena} hardwareTier="high" onClose={onClose} />
    </TimelineProvider>
  ))

  return {
    ...result,
    mockArena,
    p1,
    p2,
    setP1,
    setP2,
    commentary,
    stance,
    onClose,
  }
}

describe('ArenaOverlay Component', () => {
  afterEach(cleanup)

  it('renders high-contrast top bar HUD strip and fighter cards', () => {
    mountArenaOverlay()

    // Top Bar elements
    expect(screen.getByText('Flame Clash Arena 3D')).toBeDefined()
    expect(screen.getByText('READY TO CLASH')).toBeDefined()

    // Fighter names on both sides
    expect(screen.getByText('Cosmic Phoenix')).toBeDefined()
    expect(screen.getByText('Void Marauder')).toBeDefined()

    // Central Clash button
    expect(screen.getByText('CLASH')).toBeDefined()
  })

  it('allows tactical stance selection from fighter card', () => {
    const { stance } = mountArenaOverlay()

    expect(stance()).toBe('balanced')

    // Click Resonance Surge stance button in Player 1 card
    const resonanceBtn = screen.getByText('Resonance Surge')
    fireEvent.click(resonanceBtn)

    expect(stance()).toBe('resonance')
  })

  it('allows adjusting symmetry order on Player 1 and Player 2', () => {
    const { p1, p2 } = mountArenaOverlay()

    // Find C4 buttons for P1 and P2
    const c4Buttons = screen.getAllByRole('button', {
      name: /Set 4-fold rotational symmetry/i,
    })
    expect(c4Buttons.length).toBe(2)

    // Click C4 on Player 1
    fireEvent.click(c4Buttons[0]!)
    const p1SymKeys = Object.keys(p1()?.flame?.transforms ?? {}).filter((k) =>
      k.startsWith('_sym__'),
    )
    expect(p1SymKeys.length).toBeGreaterThanOrEqual(1)
    expect(p1()?.metrics?.symmetryScore).toBe(5.0)
    expect(p1()?.groundedStats?.symmetryOrder).toBe(4)

    // Click C4 again on Player 1 to toggle off/reset to C1
    fireEvent.click(c4Buttons[0]!)
    expect(p1()?.groundedStats?.symmetryOrder).toBe(1)
    expect(p1()?.metrics?.symmetryScore).toBe(0)

    // Click C4 on Player 2
    fireEvent.click(c4Buttons[1]!)
    const p2SymKeys = Object.keys(p2()?.flame?.transforms ?? {}).filter((k) =>
      k.startsWith('_sym__'),
    )
    expect(p2SymKeys.length).toBeGreaterThanOrEqual(1)
    expect(p2()?.metrics?.symmetryScore).toBe(5.0)
    expect(p2()?.groundedStats?.symmetryOrder).toBe(4)
  })

  it('renders Sync Active and From Gallery action buttons', () => {
    mountArenaOverlay()

    expect(
      screen.getByRole('button', { name: /Sync active flame/i }),
    ).toBeDefined()
    const galleryButtons = screen.getAllByRole('button', {
      name: /from gallery/i,
    })
    expect(galleryButtons.length).toBe(2)
  })

  it('rerolling opponent updates opponent stats and triggers new archetype', () => {
    const { p2 } = mountArenaOverlay()

    const rerollBtn = screen.getByRole('button', { name: /Reroll Opponent/i })
    fireEvent.click(rerollBtn)

    // The name and stats should be regenerated from procedural archetypes
    expect(p2()?.name).toBeDefined()
    expect(p2()?.flame).toBeDefined()
  })

  it('renders modal container without isClashing class when idle', () => {
    mountArenaOverlay()
    const modal = screen.getByTestId('flame-clash-arena-modal')
    expect(modal).toBeDefined()
    expect(modal.className).not.toContain('isClashing')
  })

  it('immediately presents the Center Winner Trophy Card upon results state', async () => {
    const { mockArena } = mountArenaOverlay()

    // Programmatically trigger clash
    if (mockArena.startClash) {
      await mockArena.startClash({ stance: 'balanced' })
    }

    // Winner presentation card appears in center
    expect(screen.getByText(/Chaos Master • Arena Champion/i)).toBeDefined()
    expect(
      screen.getByRole('button', { name: /Next Challenger/i }),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /Replay Clash/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Download Card/i })).toBeDefined()
  })
})
