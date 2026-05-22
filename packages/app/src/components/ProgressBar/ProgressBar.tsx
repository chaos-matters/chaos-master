import { createMemo, Show } from 'solid-js'
import { accumulatedPointCount, animationExportCancel, animationExportProgress, exportProgress, forceExportNow, iterationSpeedPointPerSec, setExportProgress, setForceExportNow, } from '@/flame/renderStats'
import ui from './ProgressBar.module.css'

function formatCount(n: number): string {
  if (!isFinite(n) || n >= 1e15) return '∞'
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toLocaleString()
}

function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return ''
  if (seconds < 60) return `${Math.ceil(seconds)}s remaining`
  const min = Math.floor(seconds / 60)
  const sec = Math.ceil(seconds % 60)
  return `${min}m ${sec}s remaining`
}

export function ProgressBar() {
  const imgProgress = exportProgress
  const animProgress = animationExportProgress
  const current = createMemo(() => accumulatedPointCount())
  const speed = iterationSpeedPointPerSec

  const mode = createMemo<'image' | 'animation' | 'none'>(() => {
    if (animProgress()) return 'animation'
    if (imgProgress()) return 'image'
    return 'none'
  })

  const display = createMemo(() => {
    const m = mode()
    if (m === 'none') return 'none'
    return 'block'
  })

  // Image mode
  const imgPct = createMemo(() => {
    const p = imgProgress()
    if (!p || p.target <= 0) return 0
    const raw = (current() / p.target) * 100
    return Math.min(99.5, Math.max(0, raw))
  })

  const imgEta = createMemo(() => {
    const p = imgProgress()
    if (!p) return ''
    const remaining = p.target - current()
    const spd = speed()
    if (!spd || spd <= 0) return ''
    return formatEta(remaining / spd)
  })

  const isAnimatingImg = createMemo(() => {
    const p = imgProgress()
    return p !== undefined && current() < (p.target || 1)
  })

  // Animation mode
  const animFramePct = createMemo(() => {
    const p = animProgress()
    if (!p || p.totalFrames <= 0) return 0
    return (p.totalFramesComplete / p.totalFrames) * 100
  })

  const animPointPct = createMemo(() => {
    const p = animProgress()
    if (!p || p.targetPointsPerFrame <= 0) return 0
    return Math.min(100, (p.currentPointCount / p.targetPointsPerFrame) * 100)
  })

  const animEta = createMemo(() => {
    const p = animProgress()
    if (!p || p.totalFramesComplete <= 0) return ''
    const elapsed = (performance.now() - p.startedAt) / 1000
    const avgPerFrame = elapsed / p.totalFramesComplete
    const remaining = (p.totalFrames - p.totalFramesComplete) * avgPerFrame
    return formatEta(remaining)
  })

  const handleDismiss = () => {
    const m = mode()
    if (m === 'image') {
      setForceExportNow(true)
    } else if (m === 'animation') {
      animationExportCancel()?.()
    }
  }

  return (
    <div
      class={ui.overlay}
      style={{ display: display() }}
      onClick={handleDismiss}
      title={
        mode() === 'animation'
          ? 'Click to cancel'
          : 'Click to stop & export now'
      }
    >
      <div class={ui.inner}>
        <Show when={mode() === 'image'}>
          <div class={ui.header}>
            <span class={ui.label}>
              {isAnimatingImg()
                ? 'Rendering... (click to stop & export)'
                : 'Finalizing...'}
            </span>
            <span class={ui.stats}>
              {formatCount(current())} /{' '}
              {formatCount(imgProgress()?.target ?? 0)} pts
              <Show when={speed()}>{(s) => ` — ${formatCount(s())}/s`}</Show>
            </span>
          </div>
          <div class={ui.track}>
            <div
              class={ui.fill}
              classList={{ [ui.animate as string]: isAnimatingImg() }}
              style={{ width: `${imgPct()}%` }}
            />
          </div>
          <div class={ui.eta}>{imgEta()}</div>
        </Show>

        <Show when={mode() === 'animation'}>
          <div class={ui.header}>
            <span class={ui.label}>Rendering Animation...</span>
            <span class={ui.stats}>
              frame {animProgress()!.totalFramesComplete + 1} /{' '}
              {animProgress()!.totalFrames}
            </span>
          </div>
          <div class={ui.secondaryStats}>
            <span>
              Current frame: {formatCount(animProgress()!.currentPointCount)} /{' '}
              {formatCount(animProgress()!.targetPointsPerFrame)} pts
            </span>
            <span>{animPointPct().toFixed(0)}% quality</span>
          </div>
          <div class={ui.track}>
            <div
              class={ui.fill}
              classList={{ [ui.animate as string]: true }}
              style={{ width: `${animFramePct()}%` }}
            />
          </div>
          <div class={ui.eta}>{animEta()}</div>
        </Show>
      </div>
    </div>
  )
}
