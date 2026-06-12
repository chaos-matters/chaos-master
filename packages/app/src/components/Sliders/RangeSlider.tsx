import { Show } from 'solid-js'
import ui from './RangeSlider.module.css'

type RangeSliderProps = {
  class?: string
  value: [number, number]
  min: number
  max: number
  step?: number
  onInput: (value: [number, number]) => void
  formatValue?: (value: number) => string
  label?: string
}

export function RangeSlider(props: RangeSliderProps) {
  let trackRef: HTMLDivElement | undefined

  const step = () => props.step ?? 0.01
  const min = () => props.min
  const max = () => props.max

  const valMin = () => props.value[0]
  const valMax = () => props.value[1]

  const leftPercent = () => {
    const range = max() - min()
    if (range <= 0) return 0
    return ((valMin() - min()) / range) * 100
  }

  const rightPercent = () => {
    const range = max() - min()
    if (range <= 0) return 100
    return ((valMax() - min()) / range) * 100
  }

  const format = (v: number) => {
    if (props.formatValue) {
      return props.formatValue(v)
    }
    const stepVal = step()
    if (Number.isInteger(stepVal)) {
      return Math.round(v).toString()
    }
    const decimals = stepVal.toString().includes('.')
      ? stepVal.toString().split('.')[1]!.length
      : 2
    return v.toFixed(decimals)
  }

  let activeDrag: 'min' | 'max' | null = null

  function handlePointerDown(e: PointerEvent, type: 'min' | 'max') {
    e.preventDefault()
    e.stopPropagation()
    activeDrag = type

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (ev: PointerEvent) => {
      if (!trackRef || !activeDrag) return
      const rect = trackRef.getBoundingClientRect()
      const pct = (ev.clientX - rect.left) / rect.width
      const rawVal = min() + pct * (max() - min())

      const stepVal = step()
      const decimals = stepVal.toString().includes('.')
        ? stepVal.toString().split('.')[1]!.length
        : 0
      let rounded = Math.round(rawVal / stepVal) * stepVal
      rounded = Number(rounded.toFixed(decimals))
      rounded = Math.max(min(), Math.min(max(), rounded))

      if (activeDrag === 'min') {
        const nextMin = Math.min(rounded, valMax())
        props.onInput([nextMin, valMax()])
      } else {
        const nextMax = Math.max(rounded, valMin())
        props.onInput([valMin(), nextMax])
      }
    }

    const onPointerUp = () => {
      if (e.currentTarget instanceof HTMLElement) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // Ignore release errors
        }
      }
      activeDrag = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  function handleTrackPointerDown(e: PointerEvent) {
    if (!trackRef) return
    // If user clicked directly on one of the handles, handlePointerDown will stop propagation
    const rect = trackRef.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    const rawVal = min() + pct * (max() - min())

    const stepVal = step()
    const decimals = stepVal.toString().includes('.')
      ? stepVal.toString().split('.')[1]!.length
      : 0
    let rounded = Math.round(rawVal / stepVal) * stepVal
    rounded = Number(rounded.toFixed(decimals))
    rounded = Math.max(min(), Math.min(max(), rounded))

    const distToMin = Math.abs(rounded - valMin())
    const distToMax = Math.abs(rounded - valMax())
    const type = distToMin < distToMax ? 'min' : 'max'

    if (type === 'min') {
      props.onInput([Math.min(rounded, valMax()), valMax()])
    } else {
      props.onInput([valMin(), Math.max(rounded, valMin())])
    }

    activeDrag = type
    const onPointerMove = (ev: PointerEvent) => {
      if (!trackRef || !activeDrag) return
      const rectMove = trackRef.getBoundingClientRect()
      const pctMove = (ev.clientX - rectMove.left) / rectMove.width
      const valMove = min() + pctMove * (max() - min())
      let roundedMove = Math.round(valMove / stepVal) * stepVal
      roundedMove = Number(roundedMove.toFixed(decimals))
      roundedMove = Math.max(min(), Math.min(max(), roundedMove))

      if (activeDrag === 'min') {
        props.onInput([Math.min(roundedMove, valMax()), valMax()])
      } else {
        props.onInput([valMin(), Math.max(roundedMove, valMin())])
      }
    }

    const onPointerUp = () => {
      activeDrag = null
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div class={`${ui.container} ${props.class ?? ''}`}>
      <Show when={props.label}>
        <div class={ui.labelRow}>
          <span class={ui.labelText}>{props.label}</span>
          <span class={ui.labelText}>
            {format(valMin())} – {format(valMax())}
          </span>
        </div>
      </Show>
      <div
        ref={trackRef}
        class={ui.trackWrapper}
        onPointerDown={handleTrackPointerDown}
      >
        <div class={ui.trackBackground} />
        <div
          class={ui.trackFill}
          style={{
            left: `${leftPercent()}%`,
            width: `${rightPercent() - leftPercent()}%`,
          }}
        />
        <div
          class={ui.handle}
          style={{ left: `${leftPercent()}%` }}
          onPointerDown={(e) => {
            handlePointerDown(e, 'min')
          }}
        />
        <div
          class={ui.handle}
          style={{ left: `${rightPercent()}%` }}
          onPointerDown={(e) => {
            handlePointerDown(e, 'max')
          }}
        />
      </div>
      <Show when={!props.label}>
        <div class={ui.valuesRow}>
          <span>{format(valMin())}</span>
          <span>{format(valMax())}</span>
        </div>
      </Show>
    </div>
  )
}
