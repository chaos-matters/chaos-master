import { describe, expect, it } from 'vitest'
import { keyBelongsToTarget } from './WheelZoomCamera3D'

function el(tag: string, attrs: Record<string, string> = {}): Element {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

describe('keyBelongsToTarget', () => {
  it('leaves the camera keys alone on the body and on plain elements', () => {
    expect(keyBelongsToTarget(document.body)).toBe(false)
    expect(keyBelongsToTarget(el('canvas'))).toBe(false)
    expect(keyBelongsToTarget(el('button'))).toBe(false)
    expect(keyBelongsToTarget(null)).toBe(false)
  })

  it('yields to text fields, as before', () => {
    expect(keyBelongsToTarget(el('input'))).toBe(true)
    expect(keyBelongsToTarget(el('textarea'))).toBe(true)
    expect(keyBelongsToTarget(el('select'))).toBe(true)
  })

  it('yields to a focused slider, which the duel scrub fields are', () => {
    // The arrow keys nudge the field; the camera must not also orbit.
    expect(keyBelongsToTarget(el('span', { role: 'slider' }))).toBe(true)
  })
})
