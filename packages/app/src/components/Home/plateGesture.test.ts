import { describe, expect, it } from 'vitest'
import { createPlateGestureRecogniser, DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP_PX, DRAG_THRESHOLD_PX, HOLD_MS, opensFromKey, pointerDistance, } from './plateGesture'

const at = (x: number, y: number) => ({ clientX: x, clientY: y })

describe('pointerDistance', () => {
  it('is euclidean, so diagonal jitter is not double-counted', () => {
    expect(pointerDistance(at(0, 0), at(3, 4))).toBe(5)
  })
})

describe('the drag threshold', () => {
  it('treats a still press-and-release as a click', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 80)).toBe('select')
  })

  it('still selects at exactly the threshold — 5px is not yet a drag', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    g.move(at(100 + DRAG_THRESHOLD_PX, 100), 20)
    expect(g.up(at(100 + DRAG_THRESHOLD_PX, 100), 40)).toBe('select')
  })

  it('is a drag one pixel past the threshold', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    g.move(at(100 + DRAG_THRESHOLD_PX + 1, 100), 20)
    expect(g.up(at(100 + DRAG_THRESHOLD_PX + 1, 100), 40)).toBe('none')
  })

  it('catches a drag that never reported a move, only a distant release', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(0, 0), 0)
    expect(g.up(at(400, 30), 200)).toBe('none')
  })

  it('does not un-drag by coming back to where it started', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    g.move(at(300, 100), 40) // the camera has already been panned…
    g.move(at(100, 100), 80) // …and panned back
    expect(g.up(at(100, 100), 120)).toBe('none')
  })
})

describe('a drag suppresses open', () => {
  it('never opens, however many times it is repeated', () => {
    const g = createPlateGestureRecogniser()
    for (const t of [0, 200, 400, 600]) {
      g.down(at(100, 100), t)
      g.move(at(180, 140), t + 40)
      expect(g.up(at(180, 140), t + 80)).toBe('none')
    }
  })

  it('breaks the double-click chain, so tap-drag-tap only selects', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 40)).toBe('select')
    g.down(at(100, 100), 80)
    g.move(at(200, 100), 100)
    expect(g.up(at(200, 100), 120)).toBe('none')
    g.down(at(100, 100), 140)
    expect(g.up(at(100, 100), 180)).toBe('select')
  })

  it('a cancelled sequence breaks the chain too', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 40)).toBe('select')
    g.down(at(100, 100), 80)
    g.cancel()
    g.down(at(100, 100), 120)
    expect(g.up(at(100, 100), 140)).toBe('select')
  })
})

describe('a held press is not a click', () => {
  it('does nothing when the pointer rests past the hold time', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), HOLD_MS + 1)).toBe('none')
  })

  it('still selects right up to the hold time', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), HOLD_MS)).toBe('select')
  })

  it('does not let a hold complete a double-click', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 20)).toBe('select')
    g.down(at(100, 100), 40)
    expect(g.up(at(100, 100), 40 + HOLD_MS + 1)).toBe('none')
  })
})

describe('select then open', () => {
  it('selects on the first tap and opens on the second', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 30)).toBe('select')
    g.down(at(102, 101), 120)
    expect(g.up(at(102, 101), 150)).toBe('open')
  })

  it('opens at the edge of the double-click window but not past it', () => {
    const inTime = createPlateGestureRecogniser()
    inTime.down(at(0, 0), 0)
    inTime.up(at(0, 0), 0)
    inTime.down(at(0, 0), DOUBLE_CLICK_MS)
    expect(inTime.up(at(0, 0), DOUBLE_CLICK_MS)).toBe('open')

    const tooSlow = createPlateGestureRecogniser()
    tooSlow.down(at(0, 0), 0)
    tooSlow.up(at(0, 0), 0)
    tooSlow.down(at(0, 0), DOUBLE_CLICK_MS + 1)
    expect(tooSlow.up(at(0, 0), DOUBLE_CLICK_MS + 1)).toBe('select')
  })

  it('needs the two taps to land in roughly the same place', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(0, 0), 0)
    expect(g.up(at(0, 0), 10)).toBe('select')
    g.down(at(DOUBLE_CLICK_SLOP_PX + 1, 0), 100)
    expect(g.up(at(DOUBLE_CLICK_SLOP_PX + 1, 0), 110)).toBe('select')
  })

  it('consumes the pair, so a third tap starts over instead of re-opening', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(0, 0), 0)
    expect(g.up(at(0, 0), 10)).toBe('select')
    g.down(at(0, 0), 100)
    expect(g.up(at(0, 0), 110)).toBe('open')
    g.down(at(0, 0), 200)
    expect(g.up(at(0, 0), 210)).toBe('select')
  })

  it.each(['touch', 'pen'])(
    'keeps the first tap across the post-release %s pointerleave',
    (pointerType) => {
      const g = createPlateGestureRecogniser()
      g.down(at(100, 100), 0)
      expect(g.up(at(100, 100), 30)).toBe('select')

      // Touch browsers release implicit pointer capture after pointerup and
      // dispatch pointerleave before the next tap.
      g.leave(pointerType)

      g.down(at(102, 101), 120)
      expect(g.up(at(102, 101), 150)).toBe('open')
    },
  )

  it.each(['touch', 'pen'])(
    'breaks the tap chain when a %s pointer leaves before release',
    (pointerType) => {
      const g = createPlateGestureRecogniser()
      g.down(at(100, 100), 0)
      expect(g.up(at(100, 100), 30)).toBe('select')

      g.down(at(102, 101), 120)
      g.leave(pointerType)
      expect(g.up(at(102, 101), 150)).toBe('none')

      g.down(at(102, 101), 200)
      expect(g.up(at(102, 101), 230)).toBe('select')
    },
  )

  it('does not open a stale touch pair after another plate takes selection', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 30, false)).toBe('select')
    g.leave('touch')

    // The page cleared this plate's selection when another plate was pressed.
    g.down(at(102, 101), 120)
    expect(g.up(at(102, 101), 150, false)).toBe('select')
  })

  it('breaks the double-click chain when a mouse pointer leaves the plate', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(100, 100), 0)
    expect(g.up(at(100, 100), 30)).toBe('select')
    g.leave('mouse')
    g.down(at(102, 101), 120)
    expect(g.up(at(102, 101), 150)).toBe('select')
  })

  it('ignores a release that never went down here', () => {
    const g = createPlateGestureRecogniser()
    expect(g.up(at(0, 0), 10)).toBe('none')
  })

  it('does not let a stray release complete a double-click', () => {
    const g = createPlateGestureRecogniser()
    g.down(at(0, 0), 0)
    expect(g.up(at(0, 0), 10)).toBe('select')
    // A pointerup from a sequence that began on a neighbouring plate.
    expect(g.up(at(0, 0), 50)).toBe('none')
    g.down(at(0, 0), 60)
    expect(g.up(at(0, 0), 70)).toBe('open')
  })
})

describe('opensFromKey', () => {
  it('opens on Enter and Space — there is no drag to disambiguate', () => {
    expect(opensFromKey('Enter')).toBe(true)
    expect(opensFromKey(' ')).toBe(true)
    expect(opensFromKey('Spacebar')).toBe(true)
  })

  it('leaves every other key to the page', () => {
    for (const key of ['Escape', 'Tab', 'ArrowDown', 'a', 'PageDown']) {
      expect(opensFromKey(key)).toBe(false)
    }
  })
})
