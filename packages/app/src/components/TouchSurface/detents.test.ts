import { describe, expect, it } from 'vitest'
import { clampSheetHeight, detentHeights, heightOf, nearestDetent, settleDetent, } from './detents'

const H = detentHeights(852)

describe('detentHeights', () => {
  it('is 96, 44% and 88% of the viewport', () => {
    expect(H).toEqual({ peek: 96, medium: 375, large: 750 })
    expect(heightOf('medium', H)).toBe(375)
  })
})

describe('detentHeights on a short viewport', () => {
  it('never puts a detent below peek', () => {
    // A landscape phone (852x393) whose keyboard leaves 180px of viewport:
    // 44% of it is 79, and a 79px sheet clips the chips and the shutter.
    expect(detentHeights(180)).toEqual({ peek: 96, medium: 96, large: 158 })
    expect(detentHeights(217)).toEqual({ peek: 96, medium: 96, large: 191 })
  })
})

describe('detentHeights under a ceiling', () => {
  it('keeps the sheet clear of the chrome above it', () => {
    // An iPhone 15 (852 tall, safe-top 59, safe-bottom 34): the top bar's
    // bottom edge is at 111, the sheet may not rise past 119, and the dock
    // lifts it by 42. 852 - 119 - 42 = 691, where 88% would be 750.
    expect(detentHeights(852, 691)).toEqual({
      peek: 96,
      medium: 375,
      large: 691,
    })
  })

  it('keeps the detents in order when the ceiling bites', () => {
    expect(detentHeights(852, 300)).toEqual({
      peek: 96,
      medium: 300,
      large: 300,
    })
    expect(detentHeights(852, 10)).toEqual({ peek: 96, medium: 96, large: 96 })
  })

  it('is the plain viewport arithmetic with no ceiling', () => {
    expect(detentHeights(852)).toEqual(detentHeights(852, Infinity))
  })
})

describe('clampSheetHeight', () => {
  it('never goes below peek or above large', () => {
    expect(clampSheetHeight(10, H)).toBe(96)
    expect(clampSheetHeight(2000, H)).toBe(750)
    expect(clampSheetHeight(400, H)).toBe(400)
  })
})

describe('nearestDetent', () => {
  it('picks the closest height', () => {
    expect(nearestDetent(200, H)).toBe('peek')
    expect(nearestDetent(300, H)).toBe('medium')
    expect(nearestDetent(600, H)).toBe('large')
  })
})

describe('settleDetent', () => {
  it('settles at the nearest detent when released slowly', () => {
    expect(settleDetent(200, 0.1, H)).toBe('peek')
    expect(settleDetent(300, -0.1, H)).toBe('medium')
    expect(settleDetent(600, 0, H)).toBe('large')
  })

  it('goes to the next detent in the direction of a flick', () => {
    expect(settleDetent(200, 0.6, H)).toBe('medium')
    expect(settleDetent(200, -0.6, H)).toBe('peek')
    expect(settleDetent(400, 0.6, H)).toBe('large')
    expect(settleDetent(400, -0.6, H)).toBe('medium')
    expect(settleDetent(700, -0.6, H)).toBe('medium')
  })

  it('reaches peek from medium on a flick down, and never goes below it', () => {
    expect(settleDetent(375, -0.6, H)).toBe('peek')
    expect(settleDetent(360, -1.2, H)).toBe('peek')
    expect(settleDetent(96, -2, H)).toBe('peek')
  })

  it('stays at large on a flick up from large', () => {
    expect(settleDetent(750, 0.9, H)).toBe('large')
  })
})
