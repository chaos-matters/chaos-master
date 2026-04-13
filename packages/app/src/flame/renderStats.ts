import { createSignal, runWithOwner } from 'solid-js'
import { convertMilliToSeconds } from '@/utils/convertSeconds'
import type { Accessor } from 'solid-js'

const { performance } = globalThis

type RenderTimings = {
  ifsMs: number
  adaptiveFilterMs: number
  colorGradingMs: number
}

// In Solid v2, module-scope signals need explicit detachment via runWithOwner(null, ...)
// to avoid automatic disposal when a parent owner is cleaned up.
const renderTimingsSignal = runWithOwner(null, () =>
  createSignal<RenderTimings>({
    ifsMs: 0,
    adaptiveFilterMs: 0,
    colorGradingMs: 0,
  }),
)!

export const renderTimings = renderTimingsSignal[0]
export const setRenderTimings = renderTimingsSignal[1]

const accumulatedPointCountSignal = runWithOwner(null, () =>
  createSignal(0),
)!
const iterationSpeedSignal = runWithOwner(null, () =>
  createSignal<number>(),
)!

const [accumulatedPointCount, setAccumulatedPointCount_] =
  accumulatedPointCountSignal
const [iterationSpeedPointPerSec, setIterationSpeed] = iterationSpeedSignal

type AccumulationValueTime = {
  timeMs: number
  value: number
}
const ACCUMULATION_BUFFER_SIZE = 100
const accumulationValues: AccumulationValueTime[] = []

function setAccumulatedPointCountGlobal(value: number) {
  setAccumulatedPointCount_(value)
  const timeMs = performance.now()
  accumulationValues.push({ value, timeMs })
  if (accumulationValues.length > ACCUMULATION_BUFFER_SIZE) {
    accumulationValues.shift()
  }

  const first = accumulationValues[0]
  if (first) {
    const deltaTSec = convertMilliToSeconds(timeMs - first.timeMs)
    const deltaV = value - first.value
    if (deltaTSec > 0 && deltaV > 0) {
      setIterationSpeed(deltaV / deltaTSec)
    } else {
      setIterationSpeed(undefined)
    }
  }
}

export {
  accumulatedPointCount,
  setAccumulatedPointCountGlobal,
  iterationSpeedPointPerSec,
}

// In Solid v2, createSignal can't store function types directly because
// function-first-arg creates a writable memo. Wrap in a tuple.
const currentQualitySignal = runWithOwner(null, () =>
  createSignal<[Accessor<number>]>([() => 0]),
)!
const [_currentQuality, _setCurrentQuality] = currentQualitySignal
export const currentQuality = (): Accessor<number> => _currentQuality()[0]
export function setCurrentQuality(fn: Accessor<number>) {
  _setCurrentQuality([fn])
}

const qualityPointCountLimitSignal = runWithOwner(null, () =>
  createSignal<[Accessor<number>]>([() => 0]),
)!
const [_qualityPointCountLimit, _setQualityPointCountLimit] =
  qualityPointCountLimitSignal
export const qualityPointCountLimit = (): Accessor<number> =>
  _qualityPointCountLimit()[0]
export function setQualityPointCountLimit(fn: Accessor<number>) {
  _setQualityPointCountLimit([fn])
}
