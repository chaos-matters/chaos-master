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

/**
 * jsdom has no `PointerEvent`, and the pan handler only takes over mouse
 * pointers — touch already flicks the strip natively.
 */
function mousePointer(type: string, clientX: number): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  return event
}

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

    // Rotate reads 0.5 deg per pixel, so 180px of drag is a quarter turn.
    const rotate = screen.getByRole('slider', { name: 'Rotate' })
    rotate.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 }),
    )
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 180 }))
    window.dispatchEvent(new MouseEvent('pointerup', {}))

    // The stored matrix is what changed, not a private copy, and it went
    // through the registry so the recorder logged one step.
    const affine = firstTransform(ctx.flameDescriptor()).preAffine
    expect(affine.a).toBeCloseTo(0, 6)
    expect(affine.b).toBeCloseTo(-Math.hypot(affine.a, affine.b), 6)
  })

  it('nudges a shape field by one step from the keyboard', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Shape/ }).click()

    const offsetX = screen.getByRole('slider', { name: 'X offset' })
    offsetX.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    )
    // Shift is the coarse modifier everywhere else in the editor, so it is
    // ten steps here too.
    offsetX.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
      }),
    )

    expect(firstTransform(ctx.flameDescriptor()).preAffine.c).toBeCloseTo(
      0.11,
      6,
    )
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

  it('pans the palette strip on a mouse drag without picking a palette', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Colour/ }).click()
    const strip = screen.getByRole('group', { name: 'Palette' })
    // jsdom has no layout, so `scrollLeft` reads a permanent 0 unless the
    // element is given somewhere to put it.
    Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true })
    const swatch = strip.querySelector('button')!
    const before = ctx.flameDescriptor().renderSettings.palette?.id

    swatch.dispatchEvent(mousePointer('pointerdown', 100))
    document.dispatchEvent(mousePointer('pointermove', 40))
    document.dispatchEvent(mousePointer('pointerup', 40))
    swatch.click()

    expect(strip.scrollLeft).toBe(60)
    // The click that ends a pan is the pan's own click, not a choice.
    expect(ctx.flameDescriptor().renderSettings.palette?.id).toBe(before)
  })

  it('still applies a palette on a plain click', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Colour/ }).click()
    const strip = screen.getByRole('group', { name: 'Palette' })
    const swatch = strip.querySelectorAll('button')[2]!

    const name = swatch.textContent

    swatch.dispatchEvent(mousePointer('pointerdown', 100))
    document.dispatchEvent(mousePointer('pointerup', 100))
    swatch.click()

    expect(ctx.flameDescriptor().renderSettings.palette?.name).toBe(name)
  })

  it('opens the rest of the palettes on Show more', () => {
    mount()
    screen.getByRole('button', { name: /Colour/ }).click()
    const strip = screen.getByRole('group', { name: 'Palette' })
    const before = strip.querySelectorAll('button').length

    const more = screen.getByRole('button', { name: /more$/ })
    more.click()

    const after = strip.querySelectorAll('button').length
    expect(after).toBeGreaterThan(before)
    // And the button retires rather than paging again: this is the whole set.
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull()
  })

  it('edits a 3D transform through offsets and a fourth handle', () => {
    const ctx = createMockCommandContext()
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.dimensions = 3
    }, 'test')
    render(() => <DuelChips ctx={ctx} flame={ctx.flameDescriptor} />)
    screen.getByRole('button', { name: /Shape/ }).click()
    const panel = screen.getByLabelText('Shape')

    // Four handles, not three: the triangle is the x/y face and Z is a spoke
    // off the origin.
    expect(panel.querySelectorAll('[class*="handleHit"]')).toHaveLength(4)
    // And the fields are the three translations. A 3x4 does not decompose
    // into scale/rotation/shear the way a 2x3 does.
    for (const label of ['X offset', 'Y offset', 'Z offset']) {
      expect(screen.getByRole('slider', { name: label })).toBeTruthy()
    }
    expect(screen.queryByRole('slider', { name: 'Rotate' })).toBeNull()

    screen
      .getByRole('slider', { name: 'Z offset' })
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )

    expect(firstTransform(ctx.flameDescriptor()).preAffine.l).toBeCloseTo(
      0.01,
      6,
    )
  })

  it('offers a 2D flame the 2D handful and the whole 2D registry', () => {
    const ctx = mount()
    screen.getByRole('button', { name: /Variations/ }).click()

    screen.getByRole('button', { name: 'Add Swirl' }).click()
    expect(
      Object.values(firstTransform(ctx.flameDescriptor()).variations).map(
        (v) => v.type,
      ),
    ).toContain('swirlVar')

    screen.getByRole('button', { name: 'Add' }).click()
    expect(screen.getByPlaceholderText('Search 403 variations')).toBeTruthy()
  })

  it('offers a 3D flame the variations it can actually take', () => {
    const ctx = createMockCommandContext()
    ctx.setFlameDescriptor((draft) => {
      draft.renderSettings.dimensions = 3
    }, 'test')
    render(() => <DuelChips ctx={ctx} flame={ctx.flameDescriptor} />)
    screen.getByRole('button', { name: /Variations/ }).click()
    const types = () =>
      Object.values(firstTransform(ctx.flameDescriptor()).variations).map(
        (v) => v.type,
      )

    // The resting row's shortcuts are the 3D counterparts of the 2D handful.
    const before = types().length
    screen.getByRole('button', { name: 'Add Swirl' }).click()
    expect(types()).toHaveLength(before + 1)
    expect(types()).toContain('swirl3D')

    // And the gallery is the 3D registry. Wired to 2D, every add here came
    // back as "rejected unsafe or oversized add".
    screen.getByRole('button', { name: 'Add' }).click()
    expect(screen.getByPlaceholderText('Search 43 variations')).toBeTruthy()
    screen.getByRole('button', { name: 'Add Spherical' }).click()
    expect(types()).toContain('spherical3D')
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
