import { Checkbox } from '@/components/Checkbox/Checkbox'
import type { EditorProps } from './types'

type CheckboxEditorProps = EditorProps<number>

export function CheckboxEditor(props: CheckboxEditorProps) {
  return (
    <Checkbox
      checked={props.value == 1 ? true : false}
      onChange={(checked, _) => props.setValue(checked == true ? 1 : 0)}
    ></Checkbox>
  )
}
