import ui from './Checkbox.module.css'

type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean, ev: Event) => void
  dataParameterPath?: string
}

export function Checkbox(props: CheckboxProps) {
  return (
    <input
      type="checkbox"
      data-parameter-path={props.dataParameterPath}
      classList={{ [ui.checkbox as string]: true }}
      checked={props.checked}
      onChange={(ev) => {
        props.onChange(ev.target.checked, ev)
      }}
    />
  )
}
