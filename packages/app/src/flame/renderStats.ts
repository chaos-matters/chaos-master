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

export const [currentQuality, setCurrentQuality] = createSignal<
  Accessor<number>
>(() => 0)

export const [qualityPointCountLimit, setQualityPointCountLimit] = createSignal<
  Accessor<number>
>(() => 0)

export const [forceDrawToScreen, setForceDrawToScreen] = createSignal(true)
export const [clearRequested, setClearRequested] = createSignal(true)

export type ExportProgress = {
  current: number
  target: number
  pointsPerSec: number
}

export const [exportProgress, setExportProgress] = createSignal<
  ExportProgress | undefined
>(undefined)

export const [exportQuality, setExportQuality] = createSignal<
  number | undefined
>(undefined)

export type AnimationExportProgress = {
  currentFrame: number
  totalFrames: number
  currentPointCount: number
  targetPointsPerFrame: number
  totalFramesComplete: number
  currentTimelineFrame: number
  startedAt: number
}

export const [animationExportProgress, setAnimationExportProgress] =
  createSignal<AnimationExportProgress | undefined>(undefined)

export const [animationExportRunning, setAnimationExportRunning] =
  createSignal(false)

export const [animationExportCancel, setAnimationExportCancel] = createSignal<
  (() => void) | undefined
>(undefined)

export const [forceExportNow, setForceExportNow] = createSignal(false)
