import { createMemo, Show } from 'solid-js'
import { animationExportCancel, animationExportProgress, setForceAnimationExportNow, } from '@/flame/renderStats'
import { formatEta } from '@/utils/formatEta'
import { formatPointCount } from '@/utils/formatPointCount'
import { ExportActions } from '../ExportJobs/ExportActions'
import ui from './ProgressBar.module.css'

const { performance } = globalThis

/**
 * Bottom-center progress overlay for ANIMATION export (which still renders on the
 * main canvas). Image export runs offscreen as a background job — see the
 * top-right ExportJobTracker.
 */
export function ProgressBar() {
  const animProgress = animationExportProgress

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

  const handleStopAndSaveAnimation = () => {
    setForceAnimationExportNow(true)
  }

  const handleCancelAnimation = () => {
    animationExportCancel()?.()
  }

  return (
    <div
      class={ui.overlay}
      style={{ display: animProgress() ? 'block' : 'none' }}
    >
      <div class={ui.inner}>
        <Show when={animProgress()}>
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
                Current frame:{' '}
                {formatPointCount(animProgress()!.currentPointCount)} /{' '}
                {formatPointCount(animProgress()!.targetPointsPerFrame)} pts
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
              <ExportActions
                onStop={handleStopAndSaveAnimation}
                stopLabel="Stop & Save"
                stopTitle="Stop after current frame and save the video with all frames rendered so far"
                onCancel={handleCancelAnimation}
                cancelTitle="Cancel and discard all rendered frames"
              />
            </Show>
          </div>
        </Show>
      </div>
    </div>
  )
}
