import { Show } from 'solid-js'
import { Checkbox } from '@/components/Checkbox/Checkbox'
import { KeyframeDiamond } from '@/components/Timeline/KeyframeDiamond'
import { useTimeline } from '@/contexts/TimelineContext'
import ui from './CheckboxEditor.module.css'
import type { EditorProps } from './types'

type CheckboxEditorProps = EditorProps<number>

export function CheckboxEditor(props: CheckboxEditorProps) {
  const timeline = useTimeline()

  return (
    <label class={ui.label}>
      <span class={ui.name}>
        <Show when={props.dataParameterPath && timeline}>
          <KeyframeDiamond parameterPath={props.dataParameterPath!} />
        </Show>
        {props.name}
      </span>

      <Checkbox
        checked={props.value === 1 ? true : false}
        onChange={(checked, _) => {
          props.setValue(checked ? 1 : 0)
        }}
      ></Checkbox>
    </label>
  )
}
