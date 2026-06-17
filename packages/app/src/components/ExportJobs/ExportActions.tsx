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
}

/**
 * Shared Stop / Cancel button pair used by the export job tracker and the
 * animation progress bar, so the two stay visually + behaviourally consistent.
 */
export function ExportActions(props: ExportActionsProps) {
  return (
    <div class={ui.actions}>
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
