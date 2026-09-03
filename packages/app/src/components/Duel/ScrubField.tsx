import { createEffect, createSignal, on } from 'solid-js'
import { ChevronLeft, ChevronRight } from '@/icons'
import ui from './ScrubField.module.css'

/**
 * A number you drag sideways.
 *
 * A slider was the wrong control here and the mock is right about why: at the
 * height this strip allows, a slider is about twenty pixels long, which gives
 * roughly a fortieth of the precision the numbers next to it claim. Scrubbing
 * has no such ceiling — the range is the whole desk — and the chevrons give a
 * keyboard and click path to the same value.
 */
export function ScrubField(props: {
  label: string
  /** Already in display units; the caller converts. */
  value: number
  /** One chevron click, or one arrow key. */
  step: number
  /** Display units per pixel dragged. */
  perPixel: number
  decimals: number
  unit?: string
  onChange: (next: number) => void
}) {
  const [scrubbing, setScrubbing] = createSignal(false)
  /**
   * What we last asked for, while the command that carries it is still in
   * flight. Key repeat fires far faster than a command round-trips, and
   * without this every press after the first would compute from the same
   * stale number and the field would sit still under a held arrow key.
   */
  const [pending, setPending] = createSignal<number>()
  const current = () => pending() ?? props.value
  // Any answer at all — the value we asked for, a clamped one, or someone
  // else's edit — hands control back to the store.
  createEffect(
    on(
      () => props.value,
      () => {
        setPending(undefined)
      },
      { defer: true },
    ),
  )

  const nudge = (direction: number, multiplier = 1) => {
    const next = current() + props.step * direction * multiplier
    setPending(next)
    props.onChange(next)
  }

  const startScrub = (ev: PointerEvent) => {
    if (ev.button !== 0) return
    ev.preventDefault()
    const target = ev.currentTarget as HTMLElement
    // Capture is an optimisation, not a requirement: the move/up listeners are
    // on the window either way, so a pointer that leaves the field still drags.
    target.setPointerCapture?.(ev.pointerId)
    setScrubbing(true)
    const startX = ev.clientX
    const startValue = current()

    const move = (moveEv: PointerEvent) => {
      // Shift for fine, Ctrl for coarse — the same two modifiers the rest of
      // the editor uses on a drag.
      const scale = moveEv.shiftKey ? 0.1 : moveEv.ctrlKey ? 10 : 1
      const next =
        startValue + (moveEv.clientX - startX) * props.perPixel * scale
      setPending(next)
      props.onChange(next)
    }
    const up = () => {
      setScrubbing(false)
      target.releasePointerCapture?.(ev.pointerId)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div class={ui.field} classList={{ [ui.scrubbing!]: scrubbing() }}>
      <span class={ui.label}>{props.label}</span>
      <div class={ui.row}>
        <button
          type="button"
          class={ui.chevron}
          aria-label={`${props.label} down`}
          onClick={(ev) => {
            nudge(-1, ev.shiftKey ? 10 : 1)
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <span
          class={ui.value}
          role="slider"
          tabindex="0"
          aria-label={props.label}
          aria-valuenow={Number(current().toFixed(props.decimals))}
          aria-valuetext={`${current().toFixed(props.decimals)}${props.unit ? ` ${props.unit}` : ''}`}
          onPointerDown={startScrub}
          onKeyDown={(ev) => {
            const direction =
              ev.key === 'ArrowRight' || ev.key === 'ArrowUp'
                ? 1
                : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown'
                  ? -1
                  : 0
            if (direction === 0) return
            ev.preventDefault()
            nudge(direction, ev.shiftKey ? 10 : 1)
          }}
        >
          {/* A real minus, not a hyphen: the numbers are set in tabular
              figures and a hyphen sits at the wrong height among them. */}
          {current().toFixed(props.decimals).replace('-', '−')}
          {props.unit ? <span class={ui.unit}>{props.unit}</span> : null}
        </span>
        <button
          type="button"
          class={ui.chevron}
          aria-label={`${props.label} up`}
          onClick={(ev) => {
            nudge(1, ev.shiftKey ? 10 : 1)
          }}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
