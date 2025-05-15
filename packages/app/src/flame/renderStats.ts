import { createSignal } from 'solid-js'

type RenderStats = {
  accumulatedPointCount: number
  qualityPointCountLimit: number
  timing: {
    ifsNs: number
    renderPointsNs: number
    blurNs: number
    colorGradingNs: number
  }
}

const [renderStats, setRenderStats] = createSignal<RenderStats>({
  accumulatedPointCount: 0,
  qualityPointCountLimit: 0,
  timing: {
    ifsNs: 0,
    renderPointsNs: 0,
    blurNs: 0,
    colorGradingNs: 0,
  },
})

export { renderStats, setRenderStats }
