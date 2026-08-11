import { describe, expect, it } from 'vitest'
import { focusHintFor, focusSelectors, resolveFocusElement } from './focus'

/**
 * The follow-cam's contract (docs/channel-content-plan.md §7): a recording
 * says WHAT to look at, and replay works out where. Two things have to hold
 * for that to survive a session file living for years — hints resolve through
 * the app's existing anchor vocabulary, and a hint that resolves to nothing
 * degrades to "show the whole canvas" rather than framing an empty box.
 */

describe('focusHintFor', () => {
  it('derives a parameter hint from the path a render-setting command carries', () => {
    expect(focusHintFor('flame.setRenderSetting', ['gamma', 2.4])).toBe(
      'param:gamma',
    )
    expect(focusHintFor('flame.setRenderSetting', ['camera.zoom', 1.5])).toBe(
      'param:camera.zoom',
    )
  })

  it('points at the transform that changed, not the list', () => {
    expect(focusHintFor('flame.setProbability', ['t1', 0.5])).toBe(
      'focus:tx:t1',
    )
  })

  it('falls back to the list when the target is not identified', () => {
    expect(focusHintFor('flame.setProbability', [])).toBe('ui:transform-list')
  })

  it('has nothing to say about an unknown command', () => {
    expect(focusHintFor('some.futureCommand', ['x'])).toBeUndefined()
  })
})

describe('focusSelectors', () => {
  it('tries the parameter path first, then the tour anchors', () => {
    const selectors = focusSelectors('param:gamma')
    expect(selectors[0]).toBe('[data-parameter-path="gamma"]')
    expect(selectors).toContain('[data-tour-target="gamma-slider"]')
  })

  it('rejects a malformed hint instead of building a broken selector', () => {
    expect(focusSelectors('gamma')).toEqual([])
    expect(focusSelectors('param:')).toEqual([])
  })

  it('escapes quotes, because hints come out of user-supplied files', () => {
    // A hint of `"] , script` would otherwise close the attribute selector and
    // start a second one — querySelectorAll would match far more than intended.
    const selectors = focusSelectors('ui:a"]')
    expect(selectors[0]).toBe('[data-tour-target="a\\"]"]')
  })
})

describe('resolveFocusElement', () => {
  it('skips a zero-sized match and takes the next selector that is visible', () => {
    // jsdom gives every element a 0×0 box unless told otherwise, which is the
    // same shape as the real "control inside a collapsed card" case.
    document.body.innerHTML = `
      <div data-parameter-path="gamma"></div>
      <div data-tour-target="gamma-slider"></div>
    `
    const visible = document.querySelector<HTMLElement>(
      '[data-tour-target="gamma-slider"]',
    )!
    visible.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 30 }) as DOMRect

    expect(resolveFocusElement('param:gamma')).toBe(visible)
    document.body.innerHTML = ''
  })

  it('resolves to null when nothing matches, so the overlay shows the canvas', () => {
    document.body.innerHTML = ''
    expect(resolveFocusElement('param:nothing-here')).toBeNull()
  })
})
