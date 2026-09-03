import { describe, expect, it, vi } from 'vitest'
import { focusHintFor, focusSelectors, resolveFocusElement, revealFocusElement, } from './focus'
import { snapshotOrigin } from './snapshotOrigin'

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
      'param:transform.t1.probability',
    )
  })

  it('targets the exact transform visibility action', () => {
    expect(focusHintFor('flame.setTransformVisible', ['t3', false])).toBe(
      'focus:tx:t3:visibility',
    )
  })

  it('keeps transform and variation identity in every nested-control hint', () => {
    expect(
      focusHintFor('flame.setVariation', ['t3', 'v1', { type: 'linear' }]),
    ).toBe('focus:tx:t3:variation:v1:type')
    expect(
      focusHintFor('flame.setVariation', [
        't3',
        'v1',
        { type: 'linear' },
        'randomize',
      ]),
    ).toBe('focus:tx:t3:variation:v1:randomize')
    expect(
      focusHintFor('flame.setVariation', [
        't3',
        'v1',
        { type: 'linear' },
        'params',
      ]),
    ).toBe('focus:tx:t3:variation:v1:params')
    expect(focusHintFor('flame.setVariationVisible', ['t3', 'v1', false])).toBe(
      'focus:tx:t3:variation:v1:visibility',
    )
    expect(focusHintFor('flame.setVariationWeight', ['t3', 'v1', 0.5])).toBe(
      'param:t3.v1',
    )
    expect(focusHintFor('flame.setColorSpeed', ['t3', 0.4])).toBe(
      'param:transform.t3.colorSpeed',
    )
    expect(
      focusHintFor('flame.setVariationParams', ['t3', 'v1', 'power', 2]),
    ).toBe('param:t3.v1.power')
  })

  it('keeps affine handle identity and falls back to the owning transform', () => {
    expect(
      focusHintFor('flame.setTransformAffine', [
        't3',
        'pre',
        { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      ]),
    ).toBe('focus:tx:t3:affine')
    expect(focusSelectors('focus:tx:t3:affine')).toEqual([
      '[data-focus-id="tx:t3:affine"]',
      '[data-focus-id="tx:t3"]',
    ])
    expect(focusHintFor('flame.setFinalAffine', ['e', 0.25])).toBe(
      'param:finalTransform.e',
    )
    expect(
      focusHintFor('flame.setTransformAffine', [
        't3',
        'pre',
        { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        'randomize',
      ]),
    ).toBe('focus:tx:t3:affine:randomize')
    expect(
      focusHintFor('flame.setFinalTransform', [
        { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        'randomize',
      ]),
    ).toBe('focus:affine:final:randomize')
  })

  it('distinguishes color-wheel, component, and list-button origins', () => {
    expect(
      focusHintFor('flame.setTransformColor', [
        't3',
        0.1,
        -0.2,
        'card-randomize',
      ]),
    ).toBe('focus:tx:t3:header-color-randomize')
    expect(
      focusHintFor('flame.setTransformColor', ['t3', 0.1, -0.2, 'grid']),
    ).toBe('focus:tx:t3:color')
    expect(
      focusHintFor('flame.setTransformColor', ['t3', 0.1, -0.2, 'x']),
    ).toBe('param:transform.t3.color.x')
    expect(
      focusHintFor('flame.setTransformColor', ['t3', 0.1, -0.2, 'randomize']),
    ).toBe('focus:tx:t3:color:randomize')
    expect(focusHintFor('flame.setTransformColor', ['t3', 0, 0, 'reset'])).toBe(
      'focus:tx:t3:color:reset',
    )
  })

  it('falls back to the list when the target is not identified', () => {
    expect(focusHintFor('flame.setProbability', [])).toBe('ui:transform-list')
  })

  it('recovers exact generator focus from value-pinned snapshot origins', () => {
    expect(
      focusHintFor('flame.load', [
        {},
        'Randomize Flame',
        {},
        snapshotOrigin('flame.randomize'),
      ]),
    ).toBe('ui:randomizer-generate')
    expect(
      focusHintFor('timeline.loadTimeline', [
        {},
        snapshotOrigin('timeline.smart'),
      ]),
    ).toBe('ui:smart-animation')
  })

  it('uses exact stable anchors for view and timeline controls', () => {
    expect(focusHintFor('view.setShowTimeline', [true])).toBe(
      'ui:show-timeline',
    )
    expect(focusHintFor('view.setStochasticFilter', [true])).toBe(
      'ui:stochastic-filter',
    )
    expect(focusHintFor('view.setFlyMode', [true])).toBe('ui:fly-mode')
    expect(focusHintFor('timeline.setFps', [30])).toBe('ui:timeline-fps')
    expect(focusHintFor('timeline.setLoopMode', ['cycle'])).toBe(
      'ui:timeline-loop-mode',
    )
  })

  it('distinguishes blend selection and morph setup', () => {
    expect(focusHintFor('flame.setBlendFlame', [{}])).toBe('ui:blend-picker')
    expect(focusHintFor('flame.setupMorph', [{}])).toBe('ui:morph-picker')
  })

  it('distinguishes symmetry type and fold edits from the add action', () => {
    const ids = [['_sym__t1', 'v1']]
    expect(
      focusHintFor('flame.applySymmetry', [2, 'rotational', ids, 'type']),
    ).toBe('ui:symmetry-type')
    expect(
      focusHintFor('flame.applySymmetry', [2, 'rotational', ids, 'folds']),
    ).toBe('ui:symmetry-folds')
    expect(focusHintFor('flame.applySymmetry', [2, 'rotational', ids])).toBe(
      'ui:add-symmetry',
    )
  })

  it('targets the exact authored sonification control', () => {
    expect(
      focusHintFor('sonification.setConfig', [{}, 'harmonicDensity']),
    ).toBe('param:sonification.harmonicDensity')
    expect(focusHintFor('sonification.setEnabled', [{}])).toBe(
      'param:sonification.enabled',
    )
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
  it('resolves the exact later variation instead of the first repeated tour anchor', () => {
    document.body.innerHTML = `
      <button data-tour-target="variation-type" data-focus-id="tx:t1:variation:v1:type"></button>
      <button data-tour-target="variation-type" data-focus-id="tx:t3:variation:v1:type"></button>
    `
    const [first, exact] = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-tour-target="variation-type"]',
      ),
    )
    for (const element of [first, exact]) {
      element!.getBoundingClientRect = () =>
        ({ left: 10, top: 20, width: 100, height: 30 }) as DOMRect
    }

    expect(resolveFocusElement('focus:tx:t3:variation:v1:type')).toBe(exact)
    document.body.innerHTML = ''
  })

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

  it('reveals an off-screen target through its nearest scroll containers', () => {
    const element = document.createElement('button')
    const scrollIntoView = vi.fn()
    element.scrollIntoView = scrollIntoView

    revealFocusElement(element)

    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'nearest',
      inline: 'nearest',
    })
  })
})

describe('camera framing hints', () => {
  // `ui:canvas` used to be the answer here, which pointed every camera step at
  // the one region follow-cam never dims — so a zoom lit up nothing at all.
  it('points at the control that moved, not at the canvas', () => {
    expect(focusHintFor('camera.zoomTo', [3])).toBe('param:camera.zoom')
    expect(focusHintFor('camera.zoomBy', [2])).toBe('param:camera.zoom')
    expect(focusHintFor('camera.center', [])).toBe('param:camera.zoom')
    expect(focusHintFor('camera.frame', [0, 0, 2])).toBe('param:camera.zoom')
    expect(focusHintFor('camera.panTo', [1, 2])).toBe('param:camera.position')
    expect(focusHintFor('camera.panBy', [1, 2])).toBe('param:camera.position')
  })

  it('lands on the same anchor the pointer path writes through', () => {
    // Dragging the canvas and the zoom buttons record as render settings, so
    // both routes must resolve to one control or a mixed session jumps about.
    expect(focusHintFor('flame.setRenderSetting', ['camera.zoom', 3])).toBe(
      'param:camera.zoom',
    )
    expect(focusSelectors('param:camera.zoom')).toContain(
      '[data-parameter-path="camera.zoom"]',
    )
    expect(focusSelectors('param:camera.position')).toContain(
      '[data-parameter-path="camera.position"]',
    )
  })
})
