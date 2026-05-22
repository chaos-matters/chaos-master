/**
 * Tests for VariationParameterMaps and variation parameter resolution
 */

import { describe, expect, it } from 'vitest'
import { resolveVariationParameter, VariationParameterMaps } from './timeline'

describe('VariationParameterMaps', () => {
  it('should contain definitions for known variations', () => {
    expect(VariationParameterMaps.tunnelVar).toContain('distortion')
    expect(VariationParameterMaps.lissajousVar).toContain('freqX')
    expect(VariationParameterMaps.pigtail).toContain('xmultiplier')
  })

  it('should have at least 20 variation type definitions', () => {
    expect(Object.keys(VariationParameterMaps).length).toBeGreaterThanOrEqual(
      20,
    )
  })

  it('should include pigtail variation parameters', () => {
    expect(VariationParameterMaps.pigtail).toEqual([
      'xmultiplier',
      'ymultiplier',
    ])
  })

  it('should include blob variation parameters', () => {
    expect(VariationParameterMaps.blob).toEqual([
      'scale',
      'phi',
      'theta',
      'psi',
    ])
  })

  it('should include fan2 variation parameters', () => {
    expect(VariationParameterMaps.fan2).toEqual(['curl_1', 'curl_2'])
  })
})

describe('resolveVariationParameter', () => {
  it('should return null when timeline state is not available', () => {
    const result = resolveVariationParameter(
      {},
      'transform1',
      'variation1',
      'distortion',
      0,
    )

    expect(result).toBeNull()
  })

  it('should return null when transform does not exist', () => {
    const result = resolveVariationParameter(
      {},
      'nonexistent',
      'variation1',
      'distortion',
      0,
    )

    expect(result).toBeNull()
  })

  it('should return null when variation does not have params', () => {
    const result = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation1: {
              type: 'linear',
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation1',
      'distortion',
      0,
    )

    expect(result).toBeNull()
  })

  it('should return null when parameter is not in known variations', () => {
    const result = resolveVariationParameter(
      {},
      'transform1',
      'variation1',
      'unknownParam',
      0,
    )

    expect(result).toBeNull()
  })

  it('should return null when keyframe does not exist at current frame', () => {
    const _mockTimeline = {
      getFrame: () => 5,
      tracks: () => ({
        'transform1.variation1.distortion': {
          parameterPath: 'transform1.variation1.distortion',
          keyframes: [
            { frame: 0, value: 0.5 },
            { frame: 10, value: 1.0 },
          ],
        },
      }),
    }

    const result = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation1: {
              type: 'tunnelVar',
              params: { distortion: 0.5 },
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation1',
      'distortion',
      5,
    )

    expect(result).toBeNull()
  })

  it('should return keyframe value when keyframe exists at current frame', () => {
    const mockTimeline = {
      getFrame: () => 5,
      tracks: () => [
        {
          parameterPath: 'transform1.variation1.distortion',
          keyframes: [
            { frame: 0, value: 0.5 },
            { frame: 5, value: 0.75 },
            { frame: 10, value: 1.0 },
          ],
        },
      ],
    }
    // @ts-expect-error - Setting window property for test
    window.currentTimeline = mockTimeline

    const result = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation1: {
              type: 'tunnelVar',
              params: { distortion: 0.75 },
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation1',
      'distortion',
      5,
    )

    expect(result).toBe(0.75)
  })

  it('should support lissajous variation parameters', () => {
    const mockTimeline = {
      getFrame: () => 10,
      tracks: () => [
        {
          parameterPath: 'transform1.variation2.freqX',
          keyframes: [
            { frame: 0, value: 3.0 },
            { frame: 10, value: 7.0 },
          ],
        },
      ],
    }
    // @ts-expect-error - Setting window property for test
    window.currentTimeline = mockTimeline

    const result = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation2: {
              type: 'lissajousVar',
              params: { freqX: 3.0 },
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation2',
      'freqX',
      10,
    )

    expect(result).toBe(7.0)
  })

  it('should support multiple parameters per variation', () => {
    const mockTimeline = {
      getFrame: () => 5,
      tracks: () => [
        {
          parameterPath: 'transform1.variation3.freqX',
          keyframes: [
            { frame: 0, value: 2.0 },
            { frame: 5, value: 4.0 },
          ],
        },
        {
          parameterPath: 'transform1.variation3.freqY',
          keyframes: [
            { frame: 0, value: 3.0 },
            { frame: 5, value: 6.0 },
          ],
        },
      ],
    }
    // @ts-expect-error - Setting window property for test
    window.currentTimeline = mockTimeline

    const resultX = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation3: {
              type: 'lissajousVar',
              params: { freqX: 4.0, freqY: 6.0 },
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation3',
      'freqX',
      5,
    )

    const resultY = resolveVariationParameter(
      {
        transform1: {
          variations: {
            variation3: {
              type: 'lissajousVar',
              params: { freqX: 4.0, freqY: 6.0 },
              weight: 1,
            },
          },
        },
      },
      'transform1',
      'variation3',
      'freqY',
      5,
    )

    expect(resultX).toBe(4.0)
    expect(resultY).toBe(6.0)
  })
})
