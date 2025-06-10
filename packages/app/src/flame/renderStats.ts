import { createSignal } from 'solid-js'
import { convertMilliToSeconds } from '@/utils/convertSeconds'
import type { Accessor } from 'solid-js'

const { performance } = globalThis

type RenderTimings = {
  ifsMs: number
  adaptiveFilterMs: number
  colorGradingMs: number
}

export const [renderTimings, setRenderTimings] = createSignal<RenderTimings>({
  ifsMs: 0,
  adaptiveFilterMs: 0,
  colorGradingMs: 0,
})

const [accumulatedPointCount, setAccumulatedPointCount_] = createSignal(0)
const [iterationSpeedPointPerSec, setIterationSpeed] = createSignal<number>()

type AccumulationValueTime = {
  timeMs: number
  value: number
}
const ACCUMULATION_BUFFER_SIZE = 100
const accumulationValues: AccumulationValueTime[] = []

function setAccumulatedPointCount(value: number) {
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
  setAccumulatedPointCount,
  iterationSpeedPointPerSec,
}

export const [currentQuality, setCurrentQuality] = createSignal<
  Accessor<number>
>(() => 0)

export const [qualityPointCountLimit, setQualityPointCountLimit] = createSignal<
  Accessor<number>
>(() => 0)
