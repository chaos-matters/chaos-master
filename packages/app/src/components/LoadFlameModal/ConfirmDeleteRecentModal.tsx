import { createSignal } from 'solid-js'
import { persistentSignal } from '@/utils/persistentSignal'
import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'

export const [dontAskDeleteRecent, setDontAskDeleteRecent] = persistentSignal(
  'delete-recent-flame-dont-ask',
  false,
)

type ConfirmDeleteRecentModalProps = {
  respond: (confirmed: boolean) => void
}

export function ConfirmDeleteRecentModal(props: ConfirmDeleteRecentModalProps) {
  const [dontAsk, setDontAsk] = createSignal(dontAskDeleteRecent())

  function handleConfirm() {
    if (dontAsk()) {
      setDontAskDeleteRecent(true)
    }
    props.respond(true)
  }

  function handleCancel() {
    props.respond(false)
  }

  return (
    <>
      <ModalTitleBar onClose={handleCancel}>Delete Recent Flame</ModalTitleBar>
      <div
        style={{
          padding: 'var(--space-3)',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--space-4)',
        }}
      >
        <p style={{ margin: 0 }}>
          Are you sure you want to delete this recent flame?
        </p>
        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            'font-size': '0.9rem',
          }}
        >
          <input
            type="checkbox"
            checked={dontAsk()}
            onChange={(e) => setDontAsk(e.target.checked)}
          />
          Don't ask me again
        </label>
        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: 'var(--space-2)',
          }}
        >
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            style={{ 'background-color': '#ef4444', color: 'white' }}
            onClick={handleConfirm}
          >
            Delete
          </Button>
        </div>
      </div>
    </>
  )
}
