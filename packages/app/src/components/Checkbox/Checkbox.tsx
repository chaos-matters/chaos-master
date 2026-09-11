import ui from './Checkbox.module.css'

type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean, ev: Event) => void
  dataParameterPath?: string
  /** For a row whose label is a sibling, not a wrapping <label>. */
  'aria-label'?: string
}

export function Checkbox(props: CheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label={props['aria-label']}
      data-parameter-path={props.dataParameterPath}
      classList={{ [ui.checkbox as string]: true }}
      checked={props.checked}
      onChange={(ev) => {
        props.onChange(ev.target.checked, ev)
      }}
    />
  )
}
