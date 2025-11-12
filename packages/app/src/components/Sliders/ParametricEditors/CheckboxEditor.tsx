import { Checkbox } from '@/components/Checkbox/Checkbox'
import ui from './CheckboxEditor.module.css'
import type { EditorProps } from './types'

type CheckboxEditorProps = EditorProps<number>

export function CheckboxEditor(props: CheckboxEditorProps) {
  return (
    <label class={ui.label}>
      <span class={ui.name}>{props.name}</span>

      <Checkbox
        checked={props.value === 1 ? true : false}
        onChange={(checked, _) => {
          props.setValue(checked ? 1 : 0)
        }}
      ></Checkbox>
    </label>
  )
}
