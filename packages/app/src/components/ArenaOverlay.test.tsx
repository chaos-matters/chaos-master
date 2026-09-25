import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimelineProvider } from '@/contexts/TimelineContext'
import { createTestFlame } from '@/webmcp/testUtils'
import { ARENA_ARCHETYPES } from '@/webmcp/tools/arenaArchetypes'
import { ArenaOverlay } from './ArenaOverlay'
import type { ArenaOverlayProps } from './ArenaOverlay'
import type { ArenaFighterStats } from '@/commands/types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * A fighter as the editor hands it over: registered variation names, one of
 * them `linearVar`. createTestFlame's legacy 'linear'/'sinusoidal' names are
 * migrated away before any real flame reaches the Arena.
 */
function linearFighter(): FlameDescriptor {
  const postAffine = { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 }
  return {
    version: '1.0',
    metadata: { author: 'test', name: 'Linear Fighter', description: '' },
    renderSettings: {
      dimensions: 2,
      exposure: 0.25,
      vibrancy: 0.5,
      camera: { zoom: 1, position: [0, 0], rotation: 0 },
    },
    transforms: {
      t1: {
        probability: 0.6,
        preAffine: { a: 0.6, b: -0.2, c: 0.3, d: 0.2, e: 0.6, f: -0.1 },
        postAffine,
        color: { x: 0.3, y: 0.6 },
        colorSpeed: 0.4,
        visible: true,
        variations: { v1: { type: 'linearVar', weight: 1, visible: true } },
      },
      t2: {
        probability: 0.4,
        preAffine: { a: 0.4, b: 0.3, c: -0.4, d: -0.3, e: 0.4, f: 0.2 },
        postAffine,
        color: { x: 0.3, y: 0.6 },
        colorSpeed: 0.4,
        visible: true,
        variations: {
          v2: { type: 'sphericalVar', weight: 0.8, visible: true },
        },
      },
    },
  } as unknown as FlameDescriptor
}

/** The number a fighter card's Power row shows; cards render P1 first. */
function powerRowValues(): string[] {
  return screen
    .getAllByText('Power')
    .map((label) => label.nextElementSibling?.textContent ?? '')
}

function mountArenaOverlay(
  flames: { f1?: FlameDescriptor; f2?: FlameDescriptor } = {},
) {
  const f1 = flames.f1 ?? createTestFlame()
  const f2 = flames.f2 ?? createTestFlame()

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

    // Top Bar elements. createTestFlame is 2D, and the title says so.
    expect(screen.getByText('Flame Clash Arena 2D')).toBeDefined()
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

  // What a player reads off the card after C4 on a fighter that already uses
  // linearVar. Symmetry, Complexity, Chaos and Energy come from scoreFlame;
  // Power, HP, ATK and DEF from the grounded stats.
  it('C4 on a linearVar fighter: the card and the stats behind it', () => {
    const { p1 } = mountArenaOverlay({ f1: linearFighter() })

    const c4 = screen.getAllByRole('button', {
      name: /Set 4-fold rotational symmetry/i,
    })
    fireEvent.click(c4[0]!)

    expect(p1()?.metrics).toEqual({
      complexity: 3.5,
      chaosLevel: 1.2,
      symmetryScore: 5,
      energyIntensity: 2.3,
    })
    const g = p1()!.groundedStats!
    expect([g.symmetryOrder, g.hp, g.def, g.school]).toEqual([
      4,
      142,
      37,
      'Order',
    ])
    expect([g.beauty, g.atk, g.powerLevel]).toEqual([62, 38, 1200])
    expect(p1()?.powerLevel).toBe(1200)
    expect(powerRowValues()[0]).toBe('1200')
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
    const before = p2()!

    const rerollBtn = screen.getByRole('button', { name: /Reroll Opponent/i })
    fireEvent.click(rerollBtn)

    // The mounted opponent is not an archetype, so every roll replaces it
    // with one. Asserting only that a name and a flame exist passed without
    // the click: the mounted fighter already had both.
    const after = p2()!
    const archetype = Object.values(ARENA_ARCHETYPES).find(
      (candidate) => candidate.name === after.name,
    )
    expect(archetype?.name).toBe(after.name)
    expect(after.name).not.toBe(before.name)
    expect(after.type).toBe(archetype!.className)
    expect(after.flame).not.toBe(before.flame)
    expect(after.flame?.metadata?.name).toBe(after.name)
    expect(screen.getByText(archetype!.lore)).toBeInstanceOf(HTMLElement)
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
    expect(screen.getByText(/Lumen Apeiron • Arena Champion/i)).toBeDefined()
    expect(
      screen.getByRole('button', { name: /Next Challenger/i }),
    ).toBeDefined()
    expect(screen.getByRole('button', { name: /Replay Clash/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Download Card/i })).toBeDefined()
  })
})
