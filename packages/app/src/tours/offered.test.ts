/**
 * The tours stand down on the touch layouts, whose surfaces carry none of the
 * targets the steps point at (offered.ts). Driven through the real layout
 * store, by the preference a user sets from More or the version menu.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { setTouchLayoutPreference } from '@/stores/workspaceLayoutStore'
import { toursOffered } from './offered'

describe('toursOffered', () => {
  afterEach(() => {
    setTouchLayoutPreference('auto')
  })

  it('is false on a touch layout', () => {
    setTouchLayoutPreference('touch')
    expect(toursOffered()).toBe(false)
  })

  it('is true on the desktop layout', () => {
    setTouchLayoutPreference('desktop')
    expect(toursOffered()).toBe(true)
  })
})
