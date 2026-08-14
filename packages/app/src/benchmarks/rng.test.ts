import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID, RENDERER_RANDOM_IMPLEMENTATION_IDS, } from '@/shaders/random'
import { cpuRngState32, cpuRngState64, createCpuRngReference, createRngBenchmarkImplementation, deriveCpuRngInitialState, isAllZeroCpuRngState, RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION, RNG_IMPLEMENTATION_IDS, RNG_IMPLEMENTATION_LIST, RNG_IMPLEMENTATIONS, RNG_SEED_POLICIES, RNG_SEED_POLICY_IDS, stepCpuRng, u32ToUnitFloat, } from './rng'
import type { CpuRngState } from './rng'

function takeU32(
  implementationId: (typeof RNG_IMPLEMENTATION_IDS)[keyof typeof RNG_IMPLEMENTATION_IDS],
  initialState: CpuRngState,
  count: number,
): number[] {
  const rng = createCpuRngReference(implementationId, initialState)
  return Array.from({ length: count }, () => rng.nextU32())
}

describe('RNG benchmark registry', () => {
  it('keeps stable, versioned IDs and honest execution metadata', () => {
    expect(RNG_IMPLEMENTATION_LIST.map(({ id }) => id)).toEqual([
      'xoroshiro64ss-canonical-v1',
      'legacy-xoroshiro64-state-x-v1',
      'lcg32-numerical-recipes-v1',
    ])
    expect(DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID).toBe(
      RENDERER_RANDOM_IMPLEMENTATION_IDS.canonical,
    )
    expect(RNG_IMPLEMENTATION_IDS.legacy).toBe(
      RENDERER_RANDOM_IMPLEMENTATION_IDS.legacy,
    )
    expect(RNG_IMPLEMENTATION_IDS.xoroshiro64ss).toBe(
      RENDERER_RANDOM_IMPLEMENTATION_IDS.canonical,
    )
    expect(
      RNG_IMPLEMENTATIONS[RNG_IMPLEMENTATION_IDS.xoroshiro64ss],
    ).toMatchObject({
      lifecycleStatus: 'current',
      stateBytes: 8,
      stateLayout: 'vec2u',
      recommendedSeedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
      execution: {
        executable: true,
        status: 'renderer-wired',
      },
    })
    expect(RNG_IMPLEMENTATIONS[RNG_IMPLEMENTATION_IDS.legacy]).toMatchObject({
      lifecycleStatus: 'experimental',
      stateBytes: 8,
      stateLayout: 'vec2u',
      recommendedSeedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
      execution: {
        executable: true,
        status: 'renderer-wired',
      },
    })
    expect(RNG_IMPLEMENTATIONS[RNG_IMPLEMENTATION_IDS.lcg32]).toMatchObject({
      lifecycleStatus: 'experimental',
      stateBytes: 4,
      stateLayout: 'u32',
      execution: {
        executable: false,
        status: 'not-wired',
      },
    })
  })

  it('serializes the selected implementation and seed policy into manifest settings', () => {
    expect(
      createRngBenchmarkImplementation({
        schemaVersion: RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION,
        implementationId: RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
        seedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
      }),
    ).toEqual({
      kind: 'rng',
      id: RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
      label: 'TypeGPU noise xoroshiro64**',
      settings: {
        schemaVersion: RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION,
        implementationId: RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
        lifecycleStatus: 'current',
        stateBytes: 8,
        stateLayout: 'vec2u',
        execution: {
          executable: true,
          status: 'renderer-wired',
          reason: expect.stringContaining('Implemented by the renderer'),
        },
        seedPolicy: {
          id: RNG_SEED_POLICY_IDS.legacyPersisted,
          allZeroProtection: 'none',
          application: 'each-dispatch',
        },
      },
    })
  })
})

describe('CPU reference vectors', () => {
  it('locks the current legacy output rule', () => {
    expect(
      takeU32(RNG_IMPLEMENTATION_IDS.legacy, cpuRngState64(1, 2), 5),
    ).toEqual([0x04000603, 0x08dc601b, 0x503e471b, 0xe722ee84, 0xf3a47d3b])
  })

  it('matches canonical xoroshiro64** vectors from the pre-transition state', () => {
    expect(
      takeU32(RNG_IMPLEMENTATION_IDS.xoroshiro64ss, cpuRngState64(1, 2), 5),
    ).toEqual([0xe2ac153f, 0x30817eaa, 0x607a3436, 0xb030543b, 0xc1e30385])
  })

  it('matches the Numerical Recipes LCG32 recurrence', () => {
    expect(takeU32(RNG_IMPLEMENTATION_IDS.lcg32, cpuRngState32(1), 5)).toEqual([
      0x3c88596c, 0x5e8885db, 0x8116017e, 0xb4733ac5, 0x0cf06d60,
    ])
  })

  it('keeps the xoroshiro transition identical while changing only its output rule', () => {
    const initial = cpuRngState64(1, 2)
    const legacy = createCpuRngReference(RNG_IMPLEMENTATION_IDS.legacy, initial)
    const canonical = createCpuRngReference(
      RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
      initial,
    )

    for (let i = 0; i < 64; i += 1) {
      legacy.nextU32()
      canonical.nextU32()
    }

    expect(legacy.snapshot()).toEqual(canonical.snapshot())
  })
})

describe('seed policies and state safety', () => {
  it('documents the exact current point-zero edge instead of hiding it', () => {
    const state = deriveCpuRngInitialState(
      RNG_IMPLEMENTATION_IDS.legacy,
      0,
      0,
      RNG_SEED_POLICY_IDS.legacyPersisted,
    )

    expect(isAllZeroCpuRngState(state)).toBe(true)
    expect(
      RNG_SEED_POLICIES[RNG_SEED_POLICY_IDS.legacyPersisted].allZeroProtection,
    ).toBe('none')
    expect(stepCpuRng(RNG_IMPLEMENTATION_IDS.legacy, state)).toEqual({
      state,
      valueU32: 0,
    })
  })

  it('guarantees non-zero deterministic state for every candidate', () => {
    for (const implementation of RNG_IMPLEMENTATION_LIST) {
      for (const seed of [0, 1, 0xffffffff]) {
        for (const streamIndex of [0, 1, 1_000_000]) {
          const first = deriveCpuRngInitialState(
            implementation.id,
            seed,
            streamIndex,
            RNG_SEED_POLICY_IDS.saltedDeterministic,
          )
          const second = deriveCpuRngInitialState(
            implementation.id,
            seed,
            streamIndex,
            RNG_SEED_POLICY_IDS.saltedDeterministic,
          )
          expect(first).toEqual(second)
          expect(isAllZeroCpuRngState(first)).toBe(false)
        }
      }
    }
  })

  it('derives distinct streams and rejects malformed state or seeds', () => {
    const first = deriveCpuRngInitialState(
      RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
      42,
      0,
      RNG_SEED_POLICY_IDS.saltedDeterministic,
    )
    const second = deriveCpuRngInitialState(
      RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
      42,
      1,
      RNG_SEED_POLICY_IDS.saltedDeterministic,
    )

    expect(first).not.toEqual(second)
    expect(() =>
      deriveCpuRngInitialState(
        RNG_IMPLEMENTATION_IDS.lcg32,
        -1,
        0,
        RNG_SEED_POLICY_IDS.saltedDeterministic,
      ),
    ).toThrow(/u32/)
    expect(() =>
      createCpuRngReference(RNG_IMPLEMENTATION_IDS.lcg32, cpuRngState64(1, 2)),
    ).toThrow(/requires a u32 state/)
  })
})

describe('basic CPU distribution smoke checks', () => {
  it.each(RNG_IMPLEMENTATION_LIST)(
    '$id stays finite, bounded, and broadly uniform',
    (implementation) => {
      const initialState = deriveCpuRngInitialState(
        implementation.id,
        0x12345678,
        7,
        RNG_SEED_POLICY_IDS.saltedDeterministic,
      )
      const rng = createCpuRngReference(implementation.id, initialState)
      const bins = [0, 0, 0, 0]
      let sum = 0
      let allFiniteAndBounded = true
      const count = 32_768

      for (let i = 0; i < count; i += 1) {
        const value = rng.nextFloat01()
        allFiniteAndBounded &&=
          Number.isFinite(value) && value >= 0 && value < 1
        sum += value
        bins[Math.min(3, Math.floor(value * 4))]! += 1
      }

      expect(allFiniteAndBounded).toBe(true)
      expect(sum / count).toBeGreaterThan(0.48)
      expect(sum / count).toBeLessThan(0.52)
      for (const bin of bins) {
        expect(bin / count).toBeGreaterThan(0.22)
        expect(bin / count).toBeLessThan(0.28)
      }
    },
  )

  it('uses the same low-23-bit conversion contract as the shader helper', () => {
    expect(u32ToUnitFloat(0)).toBe(0)
    expect(u32ToUnitFloat(0x00800000)).toBe(0)
    expect(u32ToUnitFloat(0xffffffff)).toBe(1 - 1 / 0x00800000)
  })
})
