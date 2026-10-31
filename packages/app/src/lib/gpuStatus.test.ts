import { describe, expect, it, vi } from 'vitest'

// The status lives in module-level signals: each test gets a fresh module.
async function freshStatus() {
  vi.resetModules()
  return import('./gpuStatus')
}

describe('gpuError', () => {
  it('is empty until something fails', async () => {
    const { gpuError } = await freshStatus()
    expect(gpuError()).toBeUndefined()
  })

  it('keeps the first reason, not the fallout after it', async () => {
    const { gpuError, setGpuError } = await freshStatus()
    setGpuError(
      'Failed to get GPUAdapter, make sure to use a browser with WebGPU support.',
    )
    setGpuError('WebGPU is unavailable for this session.')
    expect(gpuError()).toBe(
      'Failed to get GPUAdapter, make sure to use a browser with WebGPU support.',
    )
  })
})
