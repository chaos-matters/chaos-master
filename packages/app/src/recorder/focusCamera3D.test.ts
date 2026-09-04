import { describe, expect, it } from 'vitest'
import { focusHintFor, focusSelectors, resolveFocusElement } from './focus'

/**
 * A camera step points at the control that moved. There are two such controls
 * — the 2D zoom field and the orbit's R — and the hint cannot know which flame
 * is loaded, so it offers both. Only one is ever mounted.
 */
describe('camera focus across dimensions', () => {
  it('offers the orbit control after the 2D one, never instead of it', () => {
    const zoom = focusSelectors(focusHintFor('camera.zoomBy', [2])!)
    expect(zoom[0]).toBe('[data-parameter-path="camera.zoom"]')
    expect(zoom).toContain('[data-parameter-path="camera3D.radius"]')

    // The orbit target has no field of its own, so a pan points at the group.
    const pan = focusSelectors(focusHintFor('camera.panTo', [1, 2])!)
    expect(pan[0]).toBe('[data-parameter-path="camera.position"]')
    expect(pan).toContain('[data-tour-target="camera3D-controls"]')
  })

  it('finds the orbit control when a 3D flame is what is on screen', () => {
    document.body.innerHTML = `
      <div data-tour-target="camera3D-controls">
        <input data-parameter-path="camera3D.radius" />
      </div>
    `
    const radius = document.querySelector<HTMLElement>(
      '[data-parameter-path="camera3D.radius"]',
    )!
    radius.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 100, height: 30 }) as DOMRect

    // The 2D controls are unmounted in 3D, so the first four selectors miss
    // and the step lands on the orbit's own field instead of nothing.
    expect(resolveFocusElement('param:camera.zoom')).toBe(radius)

    document.body.innerHTML = ''
  })

  it('leaves every other parameter with the selectors it always had', () => {
    expect(focusSelectors('param:gamma')).toEqual([
      '[data-parameter-path="gamma"]',
      '[data-tour-target="gamma-slider"]',
      '[data-tour-target="gamma-select"]',
      '[data-tour-target="gamma-picker"]',
      '[data-tour-target="gamma-buttons"]',
      '[data-tour-target="gamma-controls"]',
    ])
  })
})
