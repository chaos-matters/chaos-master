import ui from './Checkbox.module.css'

type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean, ev: Event) => void
}

export function Checkbox(props: CheckboxProps) {
  return (
    <input
      type="checkbox"
      classList={{ [ui.checkbox]: true }}
      checked={props.checked}
      onChange={(ev) => {
        props.onChange(ev.target.checked, ev)
      }}
    />
  )
}
