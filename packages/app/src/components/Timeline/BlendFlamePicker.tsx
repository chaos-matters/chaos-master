import { Show } from 'solid-js'
import { Cross } from '@/icons'
import ui from './BlendFlamePicker.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type BlendFlamePickerProps = {
  blendFlame?: FlameDescriptor
  blendWeight: number
  onPickBlendFlame: () => void
  onClearBlendFlame: () => void
  onBlendWeightChange: (weight: number) => void
}

export function BlendFlamePicker(props: BlendFlamePickerProps) {
  const hasBlend = () => props.blendFlame !== undefined

  return (
    <div class={ui.wrapper}>
      <button
        class={ui.blendBtn}
        classList={{ [ui.active as string]: hasBlend() }}
        onClick={props.onPickBlendFlame}
        title={hasBlend() ? 'Change blend flame' : 'Pick blend flame'}
      >
        {hasBlend() ? 'Blend' : 'Blend...'}
      </button>
      <Show when={hasBlend()}>
        <span class={ui.name}>Blend</span>
        <button
          class={ui.clearBtn}
          onClick={props.onClearBlendFlame}
          title="Remove blend flame"
        >
          <Cross />
        </button>
      </Show>
      <Show when={hasBlend()}>
        <div class={ui.sliderWrapper}>
          <input
            type="range"
            class={ui.weightSlider}
            min={0}
            max={1}
            step={0.01}
            value={props.blendWeight}
            onInput={(e) => {
              props.onBlendWeightChange(e.target.valueAsNumber)
            }}
            title="Blend weight"
          />
          <span class={ui.weightValue}>
            {(props.blendWeight * 100).toFixed(0)}%
          </span>
        </div>
      </Show>
    </div>
  )
}
