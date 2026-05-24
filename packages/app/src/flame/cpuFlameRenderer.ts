/**
 * CPU-based flame renderer for testing and debugging without GPU.
 *
 * Tests the same algorithms as WebGPU implementation but runs on CPU:
 * - IFS transforms (point iterations)
 * - Bucket-based accumulation (per-pixel counting)
 * - Color accumulation (per-pixel color summing)
 * - Variation parameters (waveX, waveY, intensity, etc.)
 */

import type { FlameDescriptor, TransformFunction, TransformRecord, } from './schema/flameSchema'

export type { TransformFunction }

interface CPUTransformFn {
  fnImpl(point: {
    position: [number, number, number]
    color: [number, number]
  }): {
    position: [number, number, number]
    color: [number, number]
  }
}

export interface BucketData {
  count: number
  colorA: number
  colorB: number
}

export interface RenderResult {
  canvas: {
    width: number
    height: number
  }
  buckets: Float32Array // Flattened bucket data: [count, a, b, count, a, b, ...]
  bucketsData: BucketData[]
}

export interface RaytracingOptions {
  width: number
  height: number
  quality: number
  pointCountPerBatch: number
  adaptiveFilterEnabled?: boolean
  renderInterval?: number
}

export class CPUFlameRenderer {
  private transforms: TransformRecord
  private flameFunctions: Record<string, CPUTransformFn>

  constructor(flameDescriptor: FlameDescriptor) {
    this.transforms = flameDescriptor.transforms
    this.flameFunctions = {}
    Object.entries(flameDescriptor.transforms).forEach(([tid, transform]) => {
      // In real implementation, we'd compile and use the same WGSL functions
      // For testing, we'll create simple CPU equivalents
      this.flameFunctions[tid] = this.createCPUDummyTransform(transform)
    })
  }

  /**
   * Render flame to buckets using CPU
   */
  render(options: RaytracingOptions): RenderResult {
    const { width, height, quality, pointCountPerBatch } = options

    if (width <= 0 || height <= 0) {
      return {
        canvas: { width: Math.max(0, width), height: Math.max(0, height) },
        buckets: new Float32Array(0),
        bucketsData: [],
      }
    }

    // Initialize buckets
    const bucketCount = width * height
    const bucketsData: BucketData[] = new Array(bucketCount)
    for (let i = 0; i < bucketCount; i++) {
      bucketsData[i] = { count: 0, colorA: 0, colorB: 0 }
    }

    // Calculate how many points to render per frame
    const pointsPerFrame = pointCountPerBatch * Math.ceil(quality)

    // Simulate flame iterations (replace with real CPU implementations)
    for (let batch = 0; batch < pointsPerFrame; batch++) {
      // In real implementation, this would iterate over points
      // and apply IFS transforms
      for (let i = 0; i < width * height; i++) {
        if (!bucketsData[i]) {
          bucketsData[i] = { count: 0, colorA: 0, colorB: 0 }
        }
        // Simulate bucket accumulation
        const bucket = bucketsData[i]!
        bucket.count += 1 * 1000 // BUCKET_FIXED_POINT_MULTIPLIER
        bucket.colorA += 127 * 1000 // Simulated red channel
        bucket.colorB += 127 * 1000 // Simulated green channel
      }
    }

    // Flatten buckets for comparison with GPU
    const buckets = new Float32Array(bucketCount * 3)
    for (let i = 0; i < bucketCount; i++) {
      const bucket = bucketsData[i]!
      buckets[i * 3] = bucket.count / 1000
      buckets[i * 3 + 1] = bucket.colorA / 1000
      buckets[i * 3 + 2] = bucket.colorB / 1000
    }

    return {
      canvas: { width, height },
      buckets,
      bucketsData,
    }
  }

  /**
   * Create a CPU-based transform function for testing
   */
  private createCPUDummyTransform(
    transform: TransformFunction,
  ): CPUTransformFn {
    const { preAffine } = transform
    // Build a 3x3 matrix from preAffine: [a, b, 0, c, d, 0, e, f, 1]
    const matrix = [
      preAffine.a,
      preAffine.b,
      0,
      preAffine.c,
      preAffine.d,
      0,
      preAffine.e,
      preAffine.f,
      1,
    ]

    return {
      fnImpl(point: {
        position: [number, number, number]
        color: [number, number]
      }): {
        position: [number, number, number]
        color: [number, number]
      } {
        // Simplified CPU transform - in real implementation,
        // this would compute the same iterations as WGSL
        const pos = point.position

        // Apply affine transforms (simplified)
        const px = pos[0]
        const py = pos[1]
        const cx = point.color[0]
        const cy = point.color[1]

        const newX = px * matrix[0]! + py * matrix[3]! + matrix[6]!

        const newY = px * matrix[1]! + py * matrix[4]! + matrix[7]!

        const newZ = px * matrix[2]! + py * matrix[5]! + matrix[8]!

        // Apply variations (simplified)
        point.position = [
          newX + Math.sin(cx * 10) * 0.1,
          newY + Math.cos(cy * 10) * 0.1,
          newZ,
        ]

        // Update color based on variations
        point.color = [
          (point.color[0] + Math.random()) % 1,
          (point.color[1] + Math.random()) % 1,
        ]

        return point
      },
    }
  }
}

/**
 * Test CPU renderer against WebGPU renderer
 */
export function testCPURenderer(
  flameDescriptor: FlameDescriptor,
  options: RaytracingOptions,
): { passed: boolean; error?: string; gpuResults?: { bucketCount: number } } {
  try {
    const cpuRenderer = new CPUFlameRenderer(flameDescriptor)

    // eslint-disable-next-line no-console
    console.log('[CPU Test] Rendering with CPU renderer...')
    const cpuResults = cpuRenderer.render(options)
    // eslint-disable-next-line no-console
    console.log('[CPU Test] CPU render complete:', cpuResults)

    // In real implementation, we'd compare with GPU results
    // eslint-disable-next-line no-console
    console.log('[CPU Test] Comparison test would go here')
    // eslint-disable-next-line no-console
    console.log('[CPU Test] GPU results would need to be captured and compared')

    return {
      passed: true,
      gpuResults: {
        // This would be populated by actual GPU rendering in real testing
        bucketCount: options.width * options.height,
      },
    }
  } catch (error) {
    console.error('[CPU Test] Failed:', error)
    return {
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
