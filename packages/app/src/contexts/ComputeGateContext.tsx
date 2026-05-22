import { createGateContext } from './GateContext'

export type RenderStatus = 'low-quality' | 'high-quality' | 'done'

export const { Provider: ComputeGate, useGate: useComputeGate } =
  createGateContext<{
    isVisible: boolean
    renderStatus: RenderStatus
    isSelected: boolean
  }>(
    'Compute',
    (state) =>
      state.isSelected
        ? 3
        : !state.isVisible || state.renderStatus === 'done'
          ? 0
          : state.renderStatus === 'low-quality'
            ? 2
            : 1,
  )
