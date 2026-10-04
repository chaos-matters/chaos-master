/**
 * Where the top bar's popovers sit relative to its glass pill
 * (docs/plans/glass-panels.md, phase 1).
 *
 * The pill is a backdrop-filter element, so glass inside it can only sample
 * the pill's own fill, and the nested-glass rule in glass.module.css drops
 * such a blur. The More list is hosted beside the pill, in the bar's frame,
 * so it is a glass layer of its own over the artwork, as the shell bar's
 * list already is. The title tooltip stays in the pill and has no blur of
 * its own. The test DOM applies no CSS, so this holds the structure the
 * stylesheet relies on.
 */
import '@/commands/builtins'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockCommandContext } from '@/webmcp/testUtils'
import { TouchHUD } from './TouchHUD'

function mount() {
  const ctx = createMockCommandContext()
  render(() => (
    <TouchHUD ctx={ctx} flame={ctx.flameDescriptor} onOpenSettings={vi.fn()} />
  ))
  return ctx
}

describe('TouchHUD popovers and the pill', () => {
  afterEach(cleanup)

  it('opens the More list beside the pill, not inside it', () => {
    mount()
    screen.getByRole('button', { name: 'More' }).click()

    const menu = screen.getByRole('menu', { name: 'More' })
    const pill = screen.getByTestId('hud-pill')
    expect(pill.contains(menu)).toBe(false)
    // Still the bar's own: it goes inert with the bar while Home covers the
    // editor, and the More button that opens it is in the pill.
    expect(screen.getByRole('banner').contains(menu)).toBe(true)
    expect(pill.contains(screen.getByRole('button', { name: 'More' }))).toBe(
      true,
    )
  })

  it('keeps the title tooltip inside the pill', () => {
    const ctx = mount()
    screen
      .getByTitle(ctx.flameDescriptor().metadata?.name || 'Untitled flame')
      .click()

    expect(
      screen.getByTestId('hud-pill').contains(screen.getByRole('tooltip')),
    ).toBe(true)
  })
})
