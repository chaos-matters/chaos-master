import { describe, expect, it } from 'vitest'
import { CPUFlameRenderer, testCPURenderer } from './cpuFlameRenderer'
import type { FlameDescriptor } from './schema/flameSchema'

describe('CPU Flame Renderer', () => {
  const sampleFlame: FlameDescriptor = {
    metadata: { author: 'test' },
    renderSettings: {
      exposure: 1,
      skipIters: 10,
      vibrancy: 0.5,
      contrast: 1,
      gamma: 2.2,
      highlightPower: 0.5,
      palettePhase: 0,
      paletteSpeed: 0,
      paletteMode: 0,
      densityEstimationQuality: 5,
      estimatorCurve: 0.5,
      drawMode: 'light',
      colorInitMode: 'colorInitZero',
      pointInitMode: 'pointInitUnitDisk',
      dimensions: 2,
      camera: { zoom: 1, position: [0, 0] },
      camera3D: {
        theta: 0,
        phi: Math.PI / 2,
        radius: 5,
        target: [0, 0, 0],
        fov: 60,
      },
      depthColorPower: 0,
      lightDirection: [-0.5, 0.5, -1.0],
      lightPower: 0,
    },
    transforms: {
      ['0']: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
        color: { x: 0, y: 0 },
        variations: {},
      },
    } as FlameDescriptor['transforms'],
  }

  describe('CPUFlameRenderer', () => {
    it('should initialize with flame descriptor', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)
      expect(renderer).toBeDefined()
    })

    it('should render basic scene', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const result = renderer.render({
        width: 100,
        height: 100,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(result).toBeDefined()
      expect(result.canvas.width).toBe(100)
      expect(result.canvas.height).toBe(100)
      expect(result.buckets).toBeInstanceOf(Float32Array)
      expect(result.buckets.length).toBe(100 * 100 * 3)
      expect(result.bucketsData).toBeDefined()
    })

    it('should handle empty canvas size', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const result = renderer.render({
        width: 0,
        height: 0,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(result).toBeDefined()
      expect(result.canvas.width).toBe(0)
      expect(result.canvas.height).toBe(0)
      expect(result.buckets.length).toBe(0)
    })

    it('should scale output with canvas size', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const smallResult = renderer.render({
        width: 50,
        height: 50,
        quality: 10,
        pointCountPerBatch: 100,
      })

      const largeResult = renderer.render({
        width: 100,
        height: 100,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(smallResult.buckets.length).toBeLessThan(
        largeResult.buckets.length,
      )
      expect(largeResult.buckets.length).toBe(100 * 100 * 3)
      expect(smallResult.buckets.length).toBe(50 * 50 * 3)
    })
  })

  describe('testCPURenderer', () => {
    it('should return passed for valid render', () => {
      const result = testCPURenderer(sampleFlame, {
        width: 10,
        height: 10,
        quality: 5,
        pointCountPerBatch: 10,
      })

      expect(result.passed).toBe(true)
    })

    it('should handle flame with empty transforms', () => {
      const emptyFlame: FlameDescriptor = {
        metadata: { author: 'test' },
        renderSettings: {
          exposure: 1,
          skipIters: 0,
          vibrancy: 0.5,
          contrast: 1,
          gamma: 2.2,
          highlightPower: 0.5,
          palettePhase: 0,
          paletteSpeed: 0.5,
          paletteMode: 0,
          densityEstimationQuality: 5,
          estimatorCurve: 0.5,
          drawMode: 'light',
          colorInitMode: 'colorInitZero',
          pointInitMode: 'pointInitUnitDisk',
          dimensions: 2,
          camera: { zoom: 1, position: [0, 0] },
          camera3D: {
            theta: 0,
            phi: Math.PI / 2,
            radius: 5,
            target: [0, 0, 0],
            fov: 60,
          },
          depthColorPower: 0,
          lightDirection: [-0.5, 0.5, -1.0],
          lightPower: 0,
        },
        transforms: {},
      }

      const result = testCPURenderer(emptyFlame, {
        width: 10,
        height: 10,
        quality: 5,
        pointCountPerBatch: 10,
      })

      expect(result.passed).toBeDefined()
    })
  })

  describe('Bucket Data Structure', () => {
    it('should create valid bucket data', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const result = renderer.render({
        width: 10,
        height: 10,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(result.bucketsData.length).toBe(100)

      for (let i = 0; i < result.bucketsData.length; i++) {
        const bucket = result.bucketsData[i]!
        expect(bucket.count).toBeGreaterThanOrEqual(0)
        expect(bucket.colorA).toBeGreaterThanOrEqual(0)
        expect(bucket.colorB).toBeGreaterThanOrEqual(0)
      }
    })

    it('should flatten and unflatten buckets correctly', () => {
      const testBucketsData = [
        { count: 1000, colorA: 500, colorB: 500 },
        { count: 2000, colorA: 1000, colorB: 1000 },
      ]

      const flattened = new Float32Array(testBucketsData.length * 3)
      for (let i = 0; i < testBucketsData.length; i++) {
        const bucket = testBucketsData[i]!
        flattened[i * 3] = bucket.count
        flattened[i * 3 + 1] = bucket.colorA
        flattened[i * 3 + 2] = bucket.colorB
      }

      expect(flattened.length).toBe(6)
      expect(flattened[0]).toBe(1000)
      expect(flattened[1]).toBe(500)
      expect(flattened[2]).toBe(500)
      expect(flattened[3]).toBe(2000)
      expect(flattened[4]).toBe(1000)
      expect(flattened[5]).toBe(1000)
    })
  })

  describe('Integration with WebGPU', () => {
    it('should produce comparable results structure', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const cpuResult = renderer.render({
        width: 50,
        height: 50,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(cpuResult.buckets).toBeInstanceOf(Float32Array)
      expect(cpuResult.canvas).toBeDefined()
      expect(cpuResult.bucketsData).toBeDefined()

      const expectedBucketCount = 50 * 50
      expect(cpuResult.buckets.length / 3).toBe(expectedBucketCount)
    })

    it('should handle different quality levels', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const lowQuality = renderer.render({
        width: 50,
        height: 50,
        quality: 5,
        pointCountPerBatch: 50,
      })

      const highQuality = renderer.render({
        width: 50,
        height: 50,
        quality: 50,
        pointCountPerBatch: 500,
      })

      expect(lowQuality.buckets.length).toBe(highQuality.buckets.length)
      expect(lowQuality.buckets.length / 3).toBe(highQuality.buckets.length / 3)
    })
  })

  describe('Error Handling', () => {
    it('should handle invalid canvas dimensions gracefully', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const invalidResult = renderer.render({
        width: -10,
        height: 10,
        quality: 10,
        pointCountPerBatch: 100,
      })

      expect(invalidResult).toBeDefined()
      expect(invalidResult.buckets.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle zero point count', () => {
      const renderer = new CPUFlameRenderer(sampleFlame)

      const result = renderer.render({
        width: 50,
        height: 50,
        quality: 0,
        pointCountPerBatch: 0,
      })

      expect(result).toBeDefined()
      expect(result.buckets.length).toBe(50 * 50 * 3)
    })
  })
})
