import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'

type RenderStats = {
  timing: {
    ifsNs: number
    blurNs: number
    colorGradingNs: number
  }
}

export const [renderStats, setRenderStats] = createSignal<RenderStats>({
  timing: {
    ifsNs: 0,
    blurNs: 0,
    colorGradingNs: 0,
  },
})

export const [accumulatedPointCount, setAccumulatedPointCount] = createSignal(0)

export const [currentQuality, setCurrentQuality] = createSignal<
  Accessor<number>
>(() => 0)

export const [qualityPointCountLimit, setQualityPointCountLimit] = createSignal<
  Accessor<number>
>(() => 0)
