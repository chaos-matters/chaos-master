import { createEffect, createSignal, Show } from 'solid-js'
import { ChevronDown } from '@/icons'
import ui from './CollapsibleCard.module.css'
import type { JSX, ParentProps } from 'solid-js'

export function CollapsibleCard(
  props: ParentProps<{
    title: string
    defaultOpen?: boolean
    class?: string
    selected?: boolean
    /** Dim the whole card (used when another transform is selected). */
    dimmed?: boolean
    /** Color of the leading select swatch + the selected outline. */
    accentColor?: string
    /** When provided, renders a leading swatch that toggles selection. */
    onToggleSelect?: () => void
    /** Right-aligned actions rendered just before the collapse chevron (e.g.
     *  visibility / delete). Their click handlers must stopPropagation so they
     *  don't also toggle the card. */
    headerActions?: JSX.Element
    /** Tour anchor on the card root (present even while collapsed). */
    'data-tour-target'?: string
    /** Bumping this number collapses the card (drives "Collapse all"). The
     *  initial value is ignored; only later changes collapse the card. Ignored
     *  when `open` is provided (controlled mode). */
    collapseEpoch?: number
    /** Controlled open state. When provided, the card is controlled — toggling
     *  calls `onToggleOpen` instead of managing its own state. */
    open?: boolean
    onToggleOpen?: () => void
  }>,
) {
  const [internalOpen, setInternalOpen] = createSignal(
    props.defaultOpen ?? true,
  )
  const isOpen = () => props.open ?? internalOpen()

  function toggleOpen() {
    if (props.open !== undefined) props.onToggleOpen?.()
    else setInternalOpen((p) => !p)
  }

  // Collapse when an external epoch advances (uncontrolled "Collapse all").
  let isInitialEpoch = true
  createEffect(() => {
    void props.collapseEpoch
    if (isInitialEpoch) {
      isInitialEpoch = false
      return
    }
    if (props.open === undefined) setInternalOpen(false)
  })
  return (
    <div
      class={ui.card}
      data-tour-target={props['data-tour-target']}
      style={
        props.accentColor ? { '--accent-color': props.accentColor } : undefined
      }
      classList={{
        [props.class ?? '']: true,
        [ui.collapsed!]: !isOpen(),
        [ui.selected!]: props.selected === true,
        [ui.dimmed!]: props.dimmed === true,
      }}
    >
      <button class={ui.header} onClick={toggleOpen}>
        <span class={ui.headerLeft}>
          <Show when={props.onToggleSelect}>
            <span
              class={ui.swatch}
              classList={{ [ui.swatchSelected!]: props.selected === true }}
              style={{ '--swatch-color': props.accentColor ?? '' }}
              role="button"
              tabindex={0}
              aria-pressed={props.selected === true}
              aria-label={`${props.selected ? 'Deselect' : 'Select'} ${props.title}`}
              onClick={(e) => {
                e.stopPropagation()
                props.onToggleSelect?.()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  props.onToggleSelect?.()
                }
              }}
            />
          </Show>
          <span class={ui.title}>{props.title}</span>
        </span>
        <span class={ui.headerRight}>
          <Show when={props.headerActions}>
            <span class={ui.headerActions}>{props.headerActions}</span>
          </Show>
          <ChevronDown
            class={ui.chevron}
            classList={{ [ui.chevronOpen!]: isOpen() }}
          />
        </span>
      </button>
      {isOpen() && <div class={ui.content}>{props.children}</div>}
    </div>
  )
}
