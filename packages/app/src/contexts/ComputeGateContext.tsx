import { createGateContext } from './GateContext'

export type RenderStatus = 'low-quality' | 'high-quality' | 'done'

export type ComputeGateState = {
  isVisible: boolean
  renderStatus: RenderStatus
  isSelected: boolean
}

export function computeGatePriority(state: ComputeGateState): number {
  if (!state.isVisible || state.renderStatus === 'done') return 0
  if (state.isSelected) return 3
  return state.renderStatus === 'low-quality' ? 2 : 1
}

export const { Provider: ComputeGate, useGate: useComputeGate } =
  createGateContext<ComputeGateState>('Compute', computeGatePriority)
