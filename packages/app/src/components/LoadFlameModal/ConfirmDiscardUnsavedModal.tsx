import { Show } from 'solid-js'
import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { PAGE_NAME } from './ConfirmOverwriteRecentModal'
import type { LeavingFor } from '@/routing/pageLinks'

type ConfirmDiscardUnsavedModalProps = {
  /** Set when the editor is being left for a page of its own rather than
   *  replaced by another flame (routing/pageLinks.ts). */
  page?: LeavingFor
  respond: (discard: boolean) => void
}

/**
 * Storage refused to store the open flame, and something else is asking to
 * take its place: another flame being loaded over it, or a page of the app's
 * own opening in this tab.
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
          Recents.{' '}
          <Show
            when={props.page}
            fallback={
              <>
                Opening another one now would lose it, and its keyframe tracks
                with it.
              </>
            }
          >
            {(page) => (
              <>
                {PAGE_NAME[page()]} opens in this tab, so leaving now would lose
                it, and its keyframe tracks with it.
              </>
            )}
          </Show>
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
          <Button onClick={handleDiscard}>
            {props.page ? 'Leave Anyway' : 'Open Anyway'}
          </Button>
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
