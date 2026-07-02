import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'

type ConfirmDeleteVariationModalProps = {
  /** Human name of the variation being deleted. */
  name: string
  respond: (confirmed: boolean) => void
}

/**
 * Shown only when the variation is USED by the current flame: deleting it
 * breaks those transforms' rendering, and the library lives outside the
 * flame's undo history (recovery is offered via the post-delete toast).
 */
export function ConfirmDeleteVariationModal(
  props: ConfirmDeleteVariationModalProps,
) {
  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(false)
        }}
      >
        Delete Custom Variation
      </ModalTitleBar>
      <div
        style={{
          padding: 'var(--space-3)',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--space-4)',
          'max-width': '26rem',
        }}
      >
        <p style={{ margin: 0 }}>
          The current flame uses <strong>{props.name}</strong>. Deleting it from
          your library will leave those variations unavailable and change how
          the flame renders.
        </p>
        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: 'var(--space-2)',
          }}
        >
          <Button
            onClick={() => {
              props.respond(false)
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              props.respond(true)
            }}
          >
            Delete anyway
          </Button>
        </div>
      </div>
    </>
  )
}
