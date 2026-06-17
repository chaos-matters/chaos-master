import ui from './ExportActions.module.css'

type ExportActionsProps = {
  /** Primary "stop but keep the result" action. */
  onStop: () => void
  stopLabel: string
  stopTitle?: string
  /** Discard the export entirely. */
  onCancel: () => void
  cancelLabel?: string
  cancelTitle?: string
  /** 'overlay' = larger buttons for the in-view dark export overlay. */
  variant?: 'default' | 'overlay'
  /** Extra class on the container (layout tweaks from the caller). */
  class?: string
}

/**
 * Shared Stop / Cancel button pair used by the export job tracker, the
 * animation progress bar, and the in-view export overlay, so they stay visually
 * + behaviourally consistent.
 */
export function ExportActions(props: ExportActionsProps) {
  return (
    <div
      classList={{
        [ui.actions!]: true,
        [ui.overlay!]: props.variant === 'overlay',
        ...(props.class ? { [props.class]: true } : {}),
      }}
    >
      <button
        type="button"
        class={ui.stopButton}
        onClick={() => {
          props.onStop()
        }}
        title={props.stopTitle}
      >
        {props.stopLabel}
      </button>
      <button
        type="button"
        class={ui.cancelButton}
        onClick={() => {
          props.onCancel()
        }}
        title={props.cancelTitle ?? 'Cancel and discard the export'}
      >
        {props.cancelLabel ?? 'Cancel'}
      </button>
    </div>
  )
}
