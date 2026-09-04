import { cleanup, render, screen, within } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { duelResult, showDuelResult } from '@/arcade/duelResult'
import { createTestFlame } from '@/webmcp/testUtils'
import { DuelResultCard } from './DuelResultCard'
import type { DuelComponent } from '@/arcade/duelJudge'
import type { DuelResult } from '@/arcade/duelResult'

function component(
  key: DuelComponent['key'],
  label: string,
  player: number,
  rival: number,
): DuelComponent {
  return { key, label, detail: 'why it counts', player, rival, weight: 22 }
}

function result(over: Partial<DuelResult> = {}): DuelResult {
  return {
    verdict: {
      winner: 'player',
      line: 'Your flame wins by 37.',
      playerScore: 342,
      rivalScore: 305,
      components: [
        component('complexity', 'Complexity', 4.6, 3.1),
        component('chaos', 'Chaos', 5.2, 6.0),
        component('symmetry', 'Symmetry', 4.7, 4.7),
        component('energy', 'Energy', 7.1, 2.2),
      ],
    },
    reason: 'finished',
    playerName: 'Ember',
    rivalName: 'Cinder',
    winnerFlame: createTestFlame(),
    archetype: 'Chaotic Vortex',
    durationMs: 120_000,
    id: 'abc1234',
    savedTakes: 2,
    ...over,
  }
}

function mount(over: Partial<DuelResult> = {}) {
  render(() => (
    <DuelResultCard
      result={result(over)}
      quality={0.95}
      adaptiveFilter
      stochasticFilter={false}
    />
  ))
}

describe('DuelResultCard', () => {
  afterEach(cleanup)

  it('heads the card with the winner and nobody else', () => {
    mount()
    expect(screen.getByRole('heading').textContent).toBe('Ember')
    expect(screen.queryByText('Cinder')).toBeNull()
  })

  it('names the loser when the loser is the viewer', () => {
    mount({ verdict: { ...result().verdict, winner: 'rival' } })
    expect(screen.getByRole('heading').textContent).toBe('Cinder')
  })

  it('leaves the badge to the glyph alone', () => {
    mount()
    // The archetype word used to sit under it and meant nothing to anyone
    // reading the card.
    expect(screen.queryByText('Chaotic Vortex')).toBeNull()
  })

  it('paints the badge glyph last, so nothing can cover it', () => {
    mount()
    const badge = screen.getByRole('dialog').querySelector('svg')!
    // Document order is paint order in SVG. The badge used to be a div whose
    // `::after` fill painted after its children and hid the spiral on screen,
    // while the canvas routine drew it — a divergence only the export showed.
    const shapes = [...badge.children].map((el) => el.tagName)
    expect(shapes).toEqual(['polygon', 'polygon', 'path'])
    expect(badge.querySelector('path')?.getAttribute('d')).toBeTruthy()
  })

  it('drops the verdict sentence from the card, keeping it as the label', () => {
    mount()
    const card = screen.getByRole('dialog')
    expect(card.textContent).not.toContain('wins by')
    expect(card.getAttribute('aria-label')).toContain('Your flame wins by 37.')
  })

  it('shows five rows, the last of them the totals', () => {
    mount()
    // Scoped to the card: the tooltip lists the same four names again.
    const card = within(screen.getByRole('dialog'))
    for (const label of ['Complexity', 'Chaos', 'Symmetry', 'Energy']) {
      expect(card.getByText(label)).toBeTruthy()
    }
    expect(card.getByText('Score')).toBeTruthy()
    expect(card.getByText('342')).toBeTruthy()
    expect(card.getByText('305')).toBeTruthy()
  })

  it('offers exactly the three icon buttons, unlabelled by text', () => {
    mount()
    for (const label of [
      'Download the card',
      'Share the winning flame',
      'How was this scored?',
    ]) {
      const button = screen.getByRole('button', { name: label })
      // Icon-only by decision: the words are in the accessible name.
      expect(button.textContent).toBe('')
    }
  })

  it('holds the download until the card has been rendered', () => {
    mount()
    expect(
      screen
        .getByRole('button', { name: 'Download the card' })
        .getAttribute('aria-disabled'),
    ).toBe('true')
  })

  it('keeps the arithmetic in a tooltip, for the winner only', () => {
    mount()
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain('4.6 × 22 = 101')
    expect(tip.textContent).toContain('Score')
    // The loser's numbers are on the rows; repeating them here would say the
    // same thing twice in half the space.
    expect(tip.textContent).not.toContain('3.1 × 22')
  })

  it('never puts a share URL on the card', () => {
    // The v1 card printed the link, and a `?flame=` payload measured out to an
    // 11,600px scroll width.
    mount()
    expect(document.body.textContent).not.toContain('?flame=')
    expect(document.body.textContent).not.toContain('http')
  })

  it('offers only one way out: nothing here can restart a real duel', () => {
    mount()
    // WebMCP is a pull model, so the browser cannot make the agent take
    // another turn. "Duel again" restarted the split screen with nobody in it.
    expect(screen.queryByRole('button', { name: /Duel again/ })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Back to the editor' }),
    ).toBeTruthy()
  })

  it('leaves on Escape, closing the tooltip first', () => {
    mount()
    const escape = () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    const info = screen.getByRole('button', { name: 'How was this scored?' })

    info.click()
    expect(info.getAttribute('aria-expanded')).toBe('true')
    escape()
    expect(info.getAttribute('aria-expanded')).toBe('false')
    // Still on screen: the first Escape spent itself on the tooltip.
    expect(screen.queryByRole('dialog')).toBeTruthy()

    // The card is mounted directly here, so what Escape has to prove is that
    // it cleared the result the stage renders from.
    showDuelResult(result())
    escape()
    expect(duelResult()).toBeUndefined()
  })

  it('drops the dial, the maths panel and the seat captions', () => {
    mount()
    expect(screen.queryByText(/duel length/i)).toBeNull()
    expect(screen.queryByText(/How was this scored\?$/)).toBeNull()
    expect(screen.queryByText("The agent's flame")).toBeNull()
  })
})
