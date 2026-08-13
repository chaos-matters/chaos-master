import { describe, expect, it } from 'vitest'
import { computeGatePriority } from './ComputeGateContext'

describe('computeGatePriority', () => {
  it('never schedules off-screen previews, even when selected', () => {
    expect(
      computeGatePriority({
        isVisible: false,
        isSelected: true,
        renderStatus: 'low-quality',
      }),
    ).toBe(0)
  })

  it('releases completed previews, even when selected', () => {
    expect(
      computeGatePriority({
        isVisible: true,
        isSelected: true,
        renderStatus: 'done',
      }),
    ).toBe(0)
  })

  it('prioritizes selected and lower-quality visible previews', () => {
    expect(
      computeGatePriority({
        isVisible: true,
        isSelected: true,
        renderStatus: 'high-quality',
      }),
    ).toBe(3)
    expect(
      computeGatePriority({
        isVisible: true,
        isSelected: false,
        renderStatus: 'low-quality',
      }),
    ).toBe(2)
    expect(
      computeGatePriority({
        isVisible: true,
        isSelected: false,
        renderStatus: 'high-quality',
      }),
    ).toBe(1)
  })
})
