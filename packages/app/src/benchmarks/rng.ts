import { DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID, RENDERER_RANDOM_IMPLEMENTATION_IDS, } from '@/shaders/random'
import type { BenchmarkImplementationV1, JsonObject } from './model'
import type { RendererRandomImplementationId } from '@/shaders/random'

export const RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION =
  'chaos-benchmark-rng-settings/v1' as const

export const RNG_IMPLEMENTATION_IDS = {
  legacy: RENDERER_RANDOM_IMPLEMENTATION_IDS.legacy,
  xoroshiro64ss: RENDERER_RANDOM_IMPLEMENTATION_IDS.canonical,
  lcg32: 'lcg32-numerical-recipes-v1',
} as const

export type RngImplementationId =
  | RendererRandomImplementationId
  | typeof RNG_IMPLEMENTATION_IDS.lcg32

export const RNG_SEED_POLICY_IDS = {
  legacyPersisted: 'legacy-persisted-plus-point-index-hash-v1',
  saltedDeterministic: 'salted-deterministic-stream-v1',
} as const

export type RngSeedPolicyId =
  (typeof RNG_SEED_POLICY_IDS)[keyof typeof RNG_SEED_POLICY_IDS]

export type RngLifecycleStatus = 'current' | 'experimental'
export type RngExecutionStatus = 'not-wired' | 'renderer-wired'
export type RngStateLayout = 'u32' | 'vec2u'

export type RngExecution =
  | {
      readonly executable: true
      readonly status: 'renderer-wired'
      readonly reason: string
    }
  | {
      readonly executable: false
      readonly status: 'not-wired'
      readonly reason: string
    }

export interface RngImplementationDefinition {
  readonly id: RngImplementationId
  readonly label: string
  readonly description: string
  readonly family: 'lcg32' | 'xoroshiro64'
  readonly lifecycleStatus: RngLifecycleStatus
  readonly stateLayout: RngStateLayout
  readonly stateWords: 1 | 2
  readonly stateBytes: 4 | 8
  readonly recommendedSeedPolicyId: RngSeedPolicyId
  readonly execution: RngExecution
  readonly metadata: JsonObject
}

export interface RngSeedPolicyDefinition {
  readonly id: RngSeedPolicyId
  readonly label: string
  readonly description: string
  readonly lifecycleStatus: RngLifecycleStatus
  readonly application: 'each-dispatch' | 'initialization'
  readonly allZeroProtection: 'guaranteed' | 'none'
  readonly metadata: JsonObject
}

const NOT_WIRED_REASON =
  'Registry-only candidate; the renderer does not implement this RNG state layout yet.'
const RENDERER_WIRED_REASON =
  'Implemented by the renderer with persisted per-chain state and compile-time implementation selection.'

export const RNG_IMPLEMENTATIONS = {
  [RNG_IMPLEMENTATION_IDS.xoroshiro64ss]: {
    id: RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
    label: 'TypeGPU noise xoroshiro64**',
    description:
      'Current renderer output rule: canonical xoroshiro64** assembled from @typegpu/noise primitives while retaining application-owned persisted state.',
    family: 'xoroshiro64',
    lifecycleStatus: 'current',
    stateLayout: 'vec2u',
    stateWords: 2,
    stateBytes: 8,
    recommendedSeedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
    execution: {
      executable: true,
      status: 'renderer-wired',
      reason: RENDERER_WIRED_REASON,
    },
    metadata: {
      canonical: true,
      outputWord: 'pre-transition-xoroshiro64-star-star',
      reference: 'https://prng.di.unimi.it/xoroshiro64starstar.c',
      rendererDefault: true,
      statePersistence: 'storage-buffer-across-dispatches',
    },
  },
  [RNG_IMPLEMENTATION_IDS.legacy]: {
    id: RNG_IMPLEMENTATION_IDS.legacy,
    label: 'Legacy xoroshiro64 state output',
    description:
      'Compatibility renderer output rule: advance the xoroshiro64 transition, then expose the low 23 bits of the updated first state word.',
    family: 'xoroshiro64',
    lifecycleStatus: 'experimental',
    stateLayout: 'vec2u',
    stateWords: 2,
    stateBytes: 8,
    recommendedSeedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
    execution: {
      executable: true,
      status: 'renderer-wired',
      reason: RENDERER_WIRED_REASON,
    },
    metadata: {
      canonical: false,
      outputWord: 'post-transition-state-word-zero',
      rendererDefault: false,
      sequenceCompatibility: 'chaos-master-main-a782388',
      statePersistence: 'storage-buffer-across-dispatches',
    },
  },
  [RNG_IMPLEMENTATION_IDS.lcg32]: {
    id: RNG_IMPLEMENTATION_IDS.lcg32,
    label: 'LCG32',
    description:
      'Numerical Recipes 32-bit linear congruential generator with one word of state.',
    family: 'lcg32',
    lifecycleStatus: 'experimental',
    stateLayout: 'u32',
    stateWords: 1,
    stateBytes: 4,
    recommendedSeedPolicyId: RNG_SEED_POLICY_IDS.saltedDeterministic,
    execution: {
      executable: false,
      status: 'not-wired',
      reason: NOT_WIRED_REASON,
    },
    metadata: {
      canonical: true,
      increment: 1013904223,
      multiplier: 1664525,
      statePersistence: 'adapter-required',
    },
  },
} as const satisfies Readonly<
  Record<RngImplementationId, RngImplementationDefinition>
>

export const RNG_IMPLEMENTATION_LIST = [
  RNG_IMPLEMENTATIONS[DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID],
  RNG_IMPLEMENTATIONS[RNG_IMPLEMENTATION_IDS.legacy],
  RNG_IMPLEMENTATIONS[RNG_IMPLEMENTATION_IDS.lcg32],
] as const

export const RNG_SEED_POLICIES = {
  [RNG_SEED_POLICY_IDS.legacyPersisted]: {
    id: RNG_SEED_POLICY_IDS.legacyPersisted,
    label: 'Current persisted state',
    description:
      'Start from the zero-initialized storage state and add hash(pointIndex) before every dispatch.',
    lifecycleStatus: 'current',
    application: 'each-dispatch',
    allZeroProtection: 'none',
    metadata: {
      deterministicSeedUsage: 'ignored',
      pointZeroCanRemainAllZero: true,
      sequenceCompatibility: 'chaos-master-main-a782388',
    },
  },
  [RNG_SEED_POLICY_IDS.saltedDeterministic]: {
    id: RNG_SEED_POLICY_IDS.saltedDeterministic,
    label: 'Salted deterministic streams',
    description:
      'Derive independent non-zero stream state from the manifest seed and point index once at initialization.',
    lifecycleStatus: 'experimental',
    application: 'initialization',
    allZeroProtection: 'guaranteed',
    metadata: {
      deterministicSeedUsage: 'u32',
      pointZeroCanRemainAllZero: false,
      salts: [0x4ab57dfb, 0xacdeda47],
    },
  },
} as const satisfies Readonly<Record<RngSeedPolicyId, RngSeedPolicyDefinition>>

export const RNG_SEED_POLICY_LIST = [
  RNG_SEED_POLICIES[RNG_SEED_POLICY_IDS.legacyPersisted],
  RNG_SEED_POLICIES[RNG_SEED_POLICY_IDS.saltedDeterministic],
] as const

export interface RngBenchmarkSelectionV1 {
  readonly schemaVersion: typeof RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION
  readonly implementationId: RngImplementationId
  readonly seedPolicyId: RngSeedPolicyId
}

export function getRngImplementation(
  id: RngImplementationId,
): RngImplementationDefinition {
  return RNG_IMPLEMENTATIONS[id]
}

export function getRngSeedPolicy(id: RngSeedPolicyId): RngSeedPolicyDefinition {
  return RNG_SEED_POLICIES[id]
}

export function createRngBenchmarkImplementation(
  selection: RngBenchmarkSelectionV1,
): BenchmarkImplementationV1 {
  const implementation = getRngImplementation(selection.implementationId)
  const seedPolicy = getRngSeedPolicy(selection.seedPolicyId)

  return {
    kind: 'rng',
    id: implementation.id,
    label: implementation.label,
    settings: {
      schemaVersion: selection.schemaVersion,
      implementationId: implementation.id,
      lifecycleStatus: implementation.lifecycleStatus,
      stateBytes: implementation.stateBytes,
      stateLayout: implementation.stateLayout,
      execution: {
        executable: implementation.execution.executable,
        status: implementation.execution.status,
        reason: implementation.execution.reason,
      },
      seedPolicy: {
        id: seedPolicy.id,
        allZeroProtection: seedPolicy.allZeroProtection,
        application: seedPolicy.application,
      },
    },
  }
}

export interface CpuRngState32 {
  readonly layout: 'u32'
  readonly words: readonly [number]
}

export interface CpuRngState64 {
  readonly layout: 'vec2u'
  readonly words: readonly [number, number]
}

export type CpuRngState = CpuRngState32 | CpuRngState64

export interface CpuRngStep {
  readonly state: CpuRngState
  readonly valueU32: number
}

export interface CpuRngReference {
  readonly implementationId: RngImplementationId
  nextFloat01(): number
  nextU32(): number
  snapshot(): CpuRngState
}

const UINT32_MAX = 0xffffffff
const UINT32_FLOAT_MANTISSA_MASK = 0x007fffff
const UINT32_FLOAT_MANTISSA_RANGE = 0x00800000
const XOROSHIRO_MULTIPLIER = 0x9e3779bb
const LCG32_MULTIPLIER = 1664525
const LCG32_INCREMENT = 1013904223
const STREAM_MULTIPLIER = 0x9e3779b9
const SEED_SALT_X = 0x4ab57dfb
const SEED_SALT_Y = 0xacdeda47
const NON_ZERO_FALLBACK_32 = 0x6d2b79f5
const NON_ZERO_FALLBACK_64 = 0x9e3779b9

function assertU32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be a u32`)
  }
  return value >>> 0
}

export function cpuRngState32(value: number): CpuRngState32 {
  return { layout: 'u32', words: [assertU32(value, 'state')] }
}

export function cpuRngState64(first: number, second: number): CpuRngState64 {
  return {
    layout: 'vec2u',
    words: [assertU32(first, 'state[0]'), assertU32(second, 'state[1]')],
  }
}

export function isAllZeroCpuRngState(state: CpuRngState): boolean {
  return state.words.every((word) => word === 0)
}

export function rotateLeftU32(value: number, shift: number): number {
  const x = assertU32(value, 'value')
  const k = assertU32(shift, 'shift') & 31
  if (k === 0) return x
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

export function hashU32(value: number): number {
  let x = assertU32(value, 'value')
  x = (x ^ (x >>> 17)) >>> 0
  x = Math.imul(x, 0xed5ad4bb) >>> 0
  x = (x ^ (x >>> 11)) >>> 0
  x = Math.imul(x, 0xac4c1b51) >>> 0
  x = (x ^ (x >>> 15)) >>> 0
  x = Math.imul(x, 0x31848bab) >>> 0
  return (x ^ (x >>> 14)) >>> 0
}

export function u32ToUnitFloat(value: number): number {
  return (
    (assertU32(value, 'value') & UINT32_FLOAT_MANTISSA_MASK) /
    UINT32_FLOAT_MANTISSA_RANGE
  )
}

export function deriveCpuRngInitialState(
  implementationId: RngImplementationId,
  deterministicSeed: number,
  streamIndex: number,
  seedPolicyId: RngSeedPolicyId,
): CpuRngState {
  const implementation = getRngImplementation(implementationId)
  const seed = assertU32(deterministicSeed, 'deterministicSeed')
  const stream = assertU32(streamIndex, 'streamIndex')

  if (seedPolicyId === RNG_SEED_POLICY_IDS.legacyPersisted) {
    const legacyWord = hashU32(stream)
    return implementation.stateLayout === 'u32'
      ? cpuRngState32(legacyWord)
      : cpuRngState64(legacyWord, legacyWord)
  }

  const mixedStream = Math.imul(stream, STREAM_MULTIPLIER) >>> 0
  const mixedSeed = hashU32((seed ^ mixedStream) >>> 0)
  const first = hashU32((mixedSeed ^ SEED_SALT_X) >>> 0)

  if (implementation.stateLayout === 'u32') {
    return cpuRngState32(first === 0 ? NON_ZERO_FALLBACK_32 : first)
  }

  let second = hashU32((rotateLeftU32(mixedSeed, 16) ^ SEED_SALT_Y) >>> 0)
  if (first === 0 && second === 0) second = NON_ZERO_FALLBACK_64
  return cpuRngState64(first, second)
}

function stepXoroshiro64(state: CpuRngState64): {
  readonly canonicalOutput: number
  readonly state: CpuRngState64
} {
  const first = state.words[0]
  let second = state.words[1]
  const canonicalOutput =
    Math.imul(
      rotateLeftU32(Math.imul(first, XOROSHIRO_MULTIPLIER) >>> 0, 5),
      5,
    ) >>> 0

  second = (second ^ first) >>> 0
  const nextFirst =
    (rotateLeftU32(first, 26) ^ second ^ ((second << 9) >>> 0)) >>> 0
  const nextSecond = rotateLeftU32(second, 13)

  return {
    canonicalOutput,
    state: cpuRngState64(nextFirst, nextSecond),
  }
}

export function stepCpuRng(
  implementationId: RngImplementationId,
  state: CpuRngState,
): CpuRngStep {
  if (implementationId === RNG_IMPLEMENTATION_IDS.lcg32) {
    if (state.layout !== 'u32') {
      throw new TypeError(`${implementationId} requires a u32 state`)
    }
    const next =
      (Math.imul(LCG32_MULTIPLIER, state.words[0]) + LCG32_INCREMENT) >>> 0
    return { state: cpuRngState32(next), valueU32: next }
  }

  if (state.layout !== 'vec2u') {
    throw new TypeError(`${implementationId} requires a vec2u state`)
  }

  const transition = stepXoroshiro64(state)
  return {
    state: transition.state,
    valueU32:
      implementationId === RNG_IMPLEMENTATION_IDS.xoroshiro64ss
        ? transition.canonicalOutput
        : transition.state.words[0],
  }
}

function cloneCpuRngState(state: CpuRngState): CpuRngState {
  return state.layout === 'u32'
    ? cpuRngState32(state.words[0])
    : cpuRngState64(state.words[0], state.words[1])
}

export function createCpuRngReference(
  implementationId: RngImplementationId,
  initialState: CpuRngState,
): CpuRngReference {
  const expectedLayout = getRngImplementation(implementationId).stateLayout
  if (initialState.layout !== expectedLayout) {
    throw new TypeError(
      `${implementationId} requires a ${expectedLayout} state`,
    )
  }

  let state = cloneCpuRngState(initialState)

  const nextU32 = () => {
    const step = stepCpuRng(implementationId, state)
    state = step.state
    return step.valueU32
  }

  return {
    implementationId,
    nextFloat01: () => u32ToUnitFloat(nextU32()),
    nextU32,
    snapshot: () => cloneCpuRngState(state),
  }
}
