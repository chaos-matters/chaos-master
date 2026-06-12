import { MAX_RECENT_FLAMES } from '../../utils/recentFlames'
import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'

type ConfirmOverwriteRecentModalProps = {
  oldestName: string
  respond: (confirmed: boolean) => void
}

export function ConfirmOverwriteRecentModal(
  props: ConfirmOverwriteRecentModalProps,
) {
  function handleConfirm() {
    props.respond(true)
  }

  function handleCancel() {
    props.respond(false)
  }

  return (
    <>
      <ModalTitleBar onClose={handleCancel}>Save Limit Reached</ModalTitleBar>
      <div
        style={{
          padding: 'var(--space-3)',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--space-4)',
        }}
      >
        <p style={{ margin: 0, 'font-size': '0.95rem', 'line-height': '1.4' }}>
          You have reached the limit of {MAX_RECENT_FLAMES} saved flames. Would
          you like to overwrite the oldest saved flame (
          <strong>{props.oldestName}</strong>)?
        </p>
        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: 'var(--space-2)',
            'margin-top': 'var(--space-2)',
          }}
        >
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            style={{ 'background-color': '#4f46e5', color: 'white' }}
            onClick={handleConfirm}
          >
            Replace Oldest
          </Button>
        </div>
      </div>
    </>
  )
}
