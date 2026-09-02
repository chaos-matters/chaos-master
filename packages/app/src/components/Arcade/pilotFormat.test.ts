import { describe, expect, it } from 'vitest'
import { formatElapsed, reasonLabel } from './pilotFormat'

describe('pilot formatting', () => {
  it('formats elapsed time as m:ss', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(725_400)).toBe('12:05')
  })
  it('labels end reasons for humans', () => {
    expect(reasonLabel('finished')).toBe('Finished')
    expect(reasonLabel('stopped')).toBe('Stopped by you')
    expect(reasonLabel('budget')).toBe('Step budget reached')
    expect(reasonLabel('error')).toBe('Ended after an error')
  })
})
