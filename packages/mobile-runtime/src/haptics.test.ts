import { describe, expect, it } from 'vitest'
import { hapticsWith, NO_HAPTICS, SELECTION_MIN_INTERVAL_MS } from './haptics'
import type { HapticPorts } from './haptics'

function fakePorts(options: { reject?: boolean } = {}) {
  const calls: string[] = []
  const answer = () =>
    options.reject
      ? Promise.reject(new Error('no vibrator'))
      : Promise.resolve()
  const ports: HapticPorts = {
    impact: (strength) => {
      calls.push(`impact:${strength}`)
      return answer()
    },
    notification: (kind) => {
      calls.push(`notification:${kind}`)
      return answer()
    },
    selectionStart: () => {
      calls.push('selectionStart')
      return answer()
    },
    selectionChanged: () => {
      calls.push('selectionChanged')
      return answer()
    },
    selectionEnd: () => {
      calls.push('selectionEnd')
      return answer()
    },
  }
  return { ports, calls }
}

describe('hapticsWith', () => {
  it('maps the vocabulary onto the ports', () => {
    const { ports, calls } = fakePorts()
    const h = hapticsWith(ports, () => true)
    h.impactLight()
    h.impactMedium()
    h.success()
    h.warning()
    h.error()
    h.selectionStart()
    h.selectionEnd()
    expect(calls).toEqual([
      'impact:light',
      'impact:medium',
      'notification:success',
      'notification:warning',
      'notification:error',
      'selectionStart',
      'selectionEnd',
    ])
  })

  it('fires nothing when disabled', () => {
    const { ports, calls } = fakePorts()
    const h = hapticsWith(ports, () => false)
    h.impactLight()
    h.selectionChanged()
    h.success()
    expect(calls).toEqual([])
  })

  it('rate-limits selectionChanged to one per 60 ms', () => {
    let t = 1000
    const { ports, calls } = fakePorts()
    const h = hapticsWith(
      ports,
      () => true,
      () => t,
    )
    h.selectionChanged()
    t += 20
    h.selectionChanged()
    t += SELECTION_MIN_INTERVAL_MS
    h.selectionChanged()
    expect(calls.filter((c) => c === 'selectionChanged')).toHaveLength(2)
  })

  it('never throws and never awaits when a port rejects', async () => {
    const { ports } = fakePorts({ reject: true })
    const h = hapticsWith(ports, () => true)
    expect(() => {
      h.impactLight()
    }).not.toThrow()
    await Promise.resolve()
  })

  it('has a silent stand-in', () => {
    expect(() => {
      NO_HAPTICS.impactLight()
    }).not.toThrow()
  })
})
