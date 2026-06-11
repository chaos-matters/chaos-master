import { createMemo, createSignal, Show } from 'solid-js'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useKeyframeTarget } from '@/contexts/KeyframeTargetContext'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './DopeSheet.module.css'
import type { EasingCurve } from '@/utils/timeline'

interface KeyframeInspectorProps {
  selectedKeyframe: { path: string; frame: number } | null
}

const EASING_OPTIONS: EasingCurve[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]

function formatKeyframeValue(
  value:
    | number
    | string
    | [number, number, number]
    | [number, number, number, number],
): string {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value)
}

export function KeyframeInspector(props: KeyframeInspectorProps) {
  const timeline = useTimeline()!
  const changeHistory = useChangeHistory()
  const { setTargetedParameter } = useKeyframeTarget()

  const selectedKeyframeData = createMemo(() => {
    const sel = props.selectedKeyframe
    if (!sel) return null
    if (!timeline.hasKeyframeAtFrame(sel.path, sel.frame)) {
      return null
    }
    const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
    if (!kf) return null
    const val = kf.value
    if (val === null || typeof val === 'boolean') return null
    return { frame: kf.frame, value: val, easing: kf.easing, path: sel.path }
  })

  const [inspectorEditing, setInspectorEditing] = createSignal(false)
  const [inspectorEditValue, setInspectorEditValue] = createSignal('')
  let inspectorInputRef: HTMLInputElement | undefined

  function startInspectorScrub(e: PointerEvent, currentValue: number) {
    if (inspectorEditing()) return
    const sel = props.selectedKeyframe!
    const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
    const easing = kf?.easing
    const startX = e.clientX
    const startValue = currentValue
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setTargetedParameter(sel.path)

    if (!changeHistory.isPreviewing()) {
      changeHistory.startPreview('Keyframe scrub')
    }
    // Push undo once at start of scrub drag
    timeline.addKeyframe(sel.path, sel.frame, startValue, easing)

    let step = 0.01
    let min: number | undefined = undefined
    let max: number | undefined = undefined
    const domNode = document.querySelector(
      `[data-parameter-path="${sel.path}"]`,
    )
    if (domNode) {
      const stepAttr =
        domNode.getAttribute('step') || domNode.getAttribute('data-step')
      if (stepAttr) step = parseFloat(stepAttr) || 0.01

      const minAttr =
        domNode.getAttribute('min') || domNode.getAttribute('data-min')
      if (minAttr) min = parseFloat(minAttr)

      const maxAttr =
        domNode.getAttribute('max') || domNode.getAttribute('data-max')
      if (maxAttr) max = parseFloat(maxAttr)
    }

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const sensitivity = ev.ctrlKey ? 0.01 : ev.shiftKey ? 0.1 : 1
      let newValue = startValue + dx * step * sensitivity
      if (min !== undefined) newValue = Math.max(min, newValue)
      if (max !== undefined) newValue = Math.min(max, newValue)
      timeline.setKeyframeValue(sel.path, sel.frame, newValue, easing)
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (changeHistory.isPreviewing()) {
        changeHistory.commit()
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startInspectorEdit(currentValue: number) {
    setInspectorEditValue(String(currentValue))
    setInspectorEditing(true)
    requestAnimationFrame(() => inspectorInputRef?.select())
  }

  function commitInspectorEdit() {
    const parsed = parseFloat(inspectorEditValue())
    if (!isNaN(parsed)) {
      const sel = props.selectedKeyframe!
      const kf = timeline.getKeyframeAtFrame(sel.path, sel.frame)
      if (kf) {
        timeline.addKeyframe(sel.path, sel.frame, parsed, kf.easing)
      }
    }
    setInspectorEditing(false)
  }

  function cancelInspectorEdit() {
    setInspectorEditing(false)
  }

  return (
    <div class={ui.inspector}>
      <Show
        when={selectedKeyframeData()}
        fallback={
          <div class={ui.inspectorPlaceholder}>Select a keyframe to edit</div>
        }
      >
        {(kf) => (
          <>
            <span class={ui.inspectorLabel}>Time</span>
            <span class={ui.inspectorValueReadonly}>{kf().frame}</span>

            <span class={ui.inspectorLabel}>Value</span>
            <Show
              when={typeof kf().value === 'number'}
              fallback={
                <span class={ui.inspectorValueReadonly}>
                  {formatKeyframeValue(kf().value)}
                </span>
              }
            >
              <Show
                when={inspectorEditing()}
                fallback={
                  <span
                    class={ui.inspectorValue}
                    onPointerDown={(e) => {
                      startInspectorScrub(e, kf().value as number)
                    }}
                    onDblClick={() => {
                      startInspectorEdit(kf().value as number)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                    }}
                    title="Drag to adjust, double-click to edit"
                  >
                    {formatKeyframeValue(kf().value)}
                  </span>
                }
              >
                <input
                  ref={inspectorInputRef}
                  class={ui.inspectorValueInput}
                  value={inspectorEditValue()}
                  onInput={(e) => setInspectorEditValue(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      commitInspectorEdit()
                    }
                    if (e.key === 'Escape') {
                      cancelInspectorEdit()
                    }
                  }}
                  onBlur={commitInspectorEdit}
                />
              </Show>
            </Show>

            <label class={ui.inspectorEasing}>
              Ease
              <select
                value={kf().easing ?? 'linear'}
                onChange={(e) => {
                  timeline.addKeyframe(
                    kf().path,
                    kf().frame,
                    kf().value,
                    e.currentTarget.value as EasingCurve,
                  )
                }}
              >
                {EASING_OPTIONS.map((opt) => (
                  <option value={opt}>{opt}</option>
                ))}
              </select>
            </label>

            <button
              class={ui.inspectorDelete}
              onClick={() => {
                timeline.removeKeyframe(kf().path, kf().frame)
              }}
            >
              Delete
            </button>
          </>
        )}
      </Show>
    </div>
  )
}
