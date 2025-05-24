import { hexToRgbNorm, rgbNormToHex } from '@/utils/hexToRgb'
import ui from './ColorPicker.module.css'
import type { v3f } from 'typegpu/data'

type ColorPickerProps = {
  class?: string
  value: v3f | undefined
  setValue: (value: v3f) => void
}

export function ColorPicker(props: ColorPickerProps) {
  return (
    <input
      class={`${ui.colorPicker} ${props.class ?? ''}`}
      type="color"
      value={props.value ? rgbNormToHex(props.value) : 'transparent'}
      onInput={(ev) => {
        props.setValue(hexToRgbNorm(ev.target.value))
      }}
    />
  )
}
