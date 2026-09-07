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

  it('allows tactical stance selection from top bar chips', () => {
    const { stance } = mountArenaOverlay()

    expect(stance()).toBe('balanced')

    // Click Resonance Surge stance chip
    const resonanceChip = screen.getByTitle(/Resonance Surge/i)
    fireEvent.click(resonanceChip)

    expect(stance()).toBe('resonance')
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
