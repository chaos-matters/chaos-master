import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'

type ConfirmDiscardUnsavedModalProps = {
  respond: (discard: boolean) => void
}

/**
 * Storage refused to store the open flame, and something else is asking to be
 * loaded over it.
 *
 * A different question from the one at the cap, and so a prompt of its own:
 * there the user chooses which of two flames of theirs gives way, and here
 * there is nothing to trade - the work cannot be written anywhere, and all
 * that is left to decide is whether to walk away from it. Undo would bring
 * the flame back but not its keyframe tracks, so this really is the last
 * moment it exists.
 *
 * Keeping is the default: it is the answer that loses nothing, and it is the
 * one the close button and Escape land on.
 */
export function ConfirmDiscardUnsavedModal(
  props: ConfirmDiscardUnsavedModalProps,
) {
  function handleDiscard() {
    props.respond(true)
  }

  function handleKeep() {
    props.respond(false)
  }

  return (
    <>
      <ModalTitleBar onClose={handleKeep}>
        Could Not Save This Flame
      </ModalTitleBar>
      <div
        style={{
          padding: 'var(--space-3)',
          display: 'flex',
          'flex-direction': 'column',
          gap: 'var(--space-4)',
        }}
      >
        <p style={{ margin: 0, 'font-size': '0.95rem', 'line-height': '1.4' }}>
          This device refused to store the flame you have open, so it is not in
          Recents. Opening another one now would lose it, and its keyframe
          tracks with it.
        </p>
        <p style={{ margin: 0, 'font-size': '0.95rem', 'line-height': '1.4' }}>
          Keep it and you can still export a PNG or share a link from the
          actions bar.
        </p>
        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: 'var(--space-2)',
            'margin-top': 'var(--space-2)',
          }}
        >
          <Button onClick={handleDiscard}>Open Anyway</Button>
          <Button
            style={{ 'background-color': '#4f46e5', color: 'white' }}
            onClick={handleKeep}
          >
            Keep This Flame
          </Button>
        </div>
      </div>
    </>
  )
}
