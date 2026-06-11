import { createMemo, Show } from 'solid-js'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { accumulatedPointCount, animationExportCancel, animationExportProgress, exportProgress, forceExportNow, iterationSpeedPointPerSec, setExportProgress, setForceAnimationExportNow, setForceExportNow, } from '@/flame/renderStats'
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
    // eslint-disable-next-line no-restricted-globals
    const elapsed = (performance.now() - p.startedAt) / 1000
    const avgPerFrame = elapsed / p.totalFramesComplete
    const remaining = (p.totalFrames - p.totalFramesComplete) * avgPerFrame
    return formatEta(remaining)
  })

  const handleStopAndExportImage = () => {
    setForceExportNow(true)
  }

  const handleStopAndSaveAnimation = () => {
    setForceAnimationExportNow(true)
  }

  const handleCancelAnimation = () => {
    animationExportCancel()?.()
  }

  return (
    <div class={ui.overlay} style={{ display: display() }}>
      <div class={ui.inner}>
        <Show when={mode() === 'image'}>
          <div class={ui.header}>
            <span class={ui.label}>
              {isAnimatingImg() ? 'Rendering Image...' : 'Finalizing...'}
            </span>
            <span class={ui.stats}>
              {formatCount(current())} /{' '}
              {formatCount(imgProgress()?.target ?? 0)} pts
              <Show when={speed()}>{(s) => ` -- ${formatCount(s())}/s`}</Show>
            </span>
          </div>
          <div class={ui.track}>
            <div
              class={ui.fill}
              classList={{ [ui.animate as string]: isAnimatingImg() }}
              style={{ width: `${imgPct()}%` }}
            />
          </div>
          <div class={ui.animFooter}>
            <span class={ui.eta}>{imgEta()}</span>
            <Show when={isAnimatingImg()}>
              <div class={ui.animActions}>
                <button
                  type="button"
                  class={ui.stopAndSaveButton}
                  onClick={handleStopAndExportImage}
                  title="Stop rendering and export the image at current quality"
                >
                  Stop & Export
                </button>
              </div>
            </Show>
          </div>
        </Show>

        <Show when={mode() === 'animation'}>
          <div class={ui.header}>
            <span class={ui.label}>
              {animProgress()?.status === 'encoding'
                ? 'Encoding Video...'
                : 'Rendering Animation...'}
            </span>
            <span class={ui.stats}>
              {animProgress()?.status === 'encoding' ? (
                'Finalizing file...'
              ) : (
                <>
                  frame {animProgress()!.totalFramesComplete + 1} /{' '}
                  {animProgress()!.totalFrames}
                </>
              )}
            </span>
          </div>
          <Show when={animProgress()?.status !== 'encoding'}>
            <div class={ui.secondaryStats}>
              <span>
                Current frame: {formatCount(animProgress()!.currentPointCount)}{' '}
                / {formatCount(animProgress()!.targetPointsPerFrame)} pts
              </span>
              <span>{animPointPct().toFixed(0)}% quality</span>
            </div>
          </Show>
          <div class={ui.track}>
            <div
              class={ui.fill}
              classList={{ [ui.animate as string]: true }}
              style={{ width: `${animFramePct()}%` }}
            />
          </div>
          <div class={ui.animFooter}>
            <span class={ui.eta}>
              {animProgress()?.status === 'encoding'
                ? 'Saving MP4...'
                : animEta()}
            </span>
            <Show when={animProgress()?.status !== 'encoding'}>
              <div class={ui.animActions}>
                <button
                  type="button"
                  class={ui.stopAndSaveButton}
                  onClick={handleStopAndSaveAnimation}
                  title="Stop after current frame and save the video with all frames rendered so far"
                >
                  Stop & Save
                </button>
                <button
                  type="button"
                  class={ui.cancelButton}
                  onClick={handleCancelAnimation}
                  title="Cancel and discard all rendered frames"
                >
                  Cancel
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
