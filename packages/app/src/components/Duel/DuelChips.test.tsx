import '@/commands/builtins'
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { createMockCommandContext, createTestFlame } from '@/webmcp/testUtils'
import { DuelChips } from './DuelChips'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

function mount() {
  const ctx = createMockCommandContext()
  render(() => <DuelChips ctx={ctx} flame={ctx.flameDescriptor} />)
  return ctx
}

const firstTransform = (flame: FlameDescriptor) =>
  Object.values(flame.transforms)[0]!

describe('DuelChips', () => {
  afterEach(cleanup)

  it('rests as three quiet chips with nothing open', () => {
    mount()
    for (const label of ['Variations', 'Shape', 'Colour']) {
      const chip = screen.getByRole('button', { name: new RegExp(label) })
      expect(chip.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it('opens one panel at a time', () => {
    mount()
    screen.getByRole('button', { name: /Shape/ }).click()
    expect(screen.getByLabelText('Shape')).toBeTruthy()

    screen.getByRole('button', { name: /Colour/ }).click()
    // The three overlays share the top strip; opening one closes the others.
    expect(screen.queryByLabelText('Shape')).toBeNull()
    expect(screen.getByLabelText('Colour')).toBeTruthy()
  })

  it('closes on its own chip, on the X, and on Escape', () => {
    mount()
    // Re-queried every time: opening a panel moves the chip row into the
    // panel's header, so the button is a different node than it was.
    const chip = () => screen.getByRole('button', { name: /Variations/ })

    chip().click()
    chip().click()
    expect(screen.queryByLabelText('Variations')).toBeNull()

    chip().click()
    screen.getByRole('button', { name: 'Close' }).click()
    expect(screen.queryByLabelText('Variations')).toBeNull()

    chip().click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(screen.queryByLabelText('Variations')).toBeNull()
  })

  it('keeps the other two chips reachable from inside an open panel', () => {
    mount()
    screen.getByRole('button', { name: /Shape/ }).click()

    // The mock hides the resting chip row behind the panel; if switching
    // meant closing first, that would cost a click every time.
    screen.getByRole('button', { name: /Colour/ }).click()

    expect(screen.getByLabelText('Colour')).toBeTruthy()
    expect(screen.queryByLabelText('Shape')).toBeNull()
  })

  it('scrubs the shape through a real command on the player context', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Shape/ }).click()

    const rotate = screen.getByLabelText('Shape').querySelectorAll('input')[2]!
    rotate.value = '90'
    rotate.dispatchEvent(new Event('input', { bubbles: true }))

    // A quarter turn: the stored matrix is what changed, not a private copy,
    // and it went through the registry so the recorder logged one step.
    const affine = firstTransform(ctx.flameDescriptor()).preAffine
    expect(affine.a).toBeCloseTo(0, 6)
    expect(affine.d).toBeCloseTo(Math.hypot(affine.a, affine.d), 6)
  })

  it('moves a transform along the palette', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Colour/ }).click()

    const position = screen
      .getByLabelText('Colour')
      .querySelectorAll('input')[0]!
    position.value = '0.75'
    position.dispatchEvent(new Event('input', { bubbles: true }))

    expect(firstTransform(ctx.flameDescriptor()).color.x).toBeCloseTo(0.75)
  })

  it('weights a variation without leaving the strip', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Variations/ }).click()
    const panel = screen.getByLabelText('Variations')
    const slider = panel.querySelector(
      'input[type="range"]',
    ) as HTMLInputElement

    slider.value = '1.5'
    slider.dispatchEvent(new Event('input', { bubbles: true }))

    const weights = Object.values(
      firstTransform(ctx.flameDescriptor()).variations,
    ).map((v) => v.weight)
    expect(weights).toContain(1.5)
  })

  it('keeps working when a randomize takes the chosen transform away', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Shape/ }).click()
    const before = screen.getByLabelText('Shape')
    expect(before).toBeTruthy()

    // A duel is fast, and the dice button rebuilds every transform id.
    ctx.setFlameDescriptor(() => createTestFlame(), 'test')

    expect(screen.getByLabelText('Shape')).toBeTruthy()
  })
})
