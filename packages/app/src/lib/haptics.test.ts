import { describe, expect, it } from 'vitest'
import { haptic, hapticsEnabled, setHapticsEnabled } from './haptics'

describe('haptic facade', () => {
  it('is silent on the web and never throws', () => {
    expect(() => {
      haptic.impactLight()
      haptic.selectionChanged()
      haptic.success()
    }).not.toThrow()
  })

  it('remembers the Haptics setting', () => {
    expect(hapticsEnabled()).toBe(true)
    setHapticsEnabled(false)
    expect(hapticsEnabled()).toBe(false)
    setHapticsEnabled(true)
  })
})
