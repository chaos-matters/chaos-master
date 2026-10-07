import { Show } from 'solid-js'
import { MAX_RECENT_FLAMES } from '../../utils/recentFlames'
import { Button } from '../Button/Button'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import type { LeavingFor } from '@/routing/pageLinks'

/**
 * What the user did that needs the oldest kept flame's place. 'save' is the
 * wording the question always had, for Save for Later and for opening
 * another document; the others are the editor being left for a page of its
 * own, which puts the open flame in Recents on the way out
 * (routing/pageLinks.ts). The same question, in the words of what was just
 * done.
 */
export type OverwriteOccasion = 'save' | LeavingFor

/** The page being opened, as the question names it. */
const PAGE_NAME: Record<LeavingFor, string> = {
  benchmarks: 'The Benchmark Lab',
  explorer: 'The explorer',
}

type ConfirmOverwriteRecentModalProps = {
  oldestName: string
  occasion?: OverwriteOccasion
  respond: (confirmed: boolean) => void
}

export function ConfirmOverwriteRecentModal(
  props: ConfirmOverwriteRecentModalProps,
) {
  const leavingFor = () =>
    props.occasion === 'save' ? undefined : props.occasion
  const leaving = () => leavingFor() !== undefined

  function handleConfirm() {
    props.respond(true)
  }

  function handleCancel() {
    props.respond(false)
  }

  return (
    <>
      <ModalTitleBar onClose={handleCancel}>
        {leaving() ? 'Recents is full' : 'Save Limit Reached'}
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
          <Show
            when={leavingFor()}
            fallback={
              <>
                You have reached the limit of {MAX_RECENT_FLAMES} saved flames.
                Would you like to overwrite the oldest saved flame (
                <strong>{props.oldestName}</strong>)?
              </>
            }
          >
            {(page) => (
              <>
                {PAGE_NAME[page()]} opens in this tab, and the flame you're
                editing goes to Recents on the way out. Recents holds{' '}
                {MAX_RECENT_FLAMES} flames, so making room deletes the oldest:{' '}
                <strong>{props.oldestName}</strong>.
              </>
            )}
          </Show>
        </p>
        <div
          style={{
            display: 'flex',
            'justify-content': 'flex-end',
            gap: 'var(--space-2)',
            'margin-top': 'var(--space-2)',
          }}
        >
          <Button onClick={handleCancel}>
            {leaving() ? 'Stay in the editor' : 'Cancel'}
          </Button>
          <Button
            style={{ 'background-color': '#4f46e5', color: 'white' }}
            onClick={handleConfirm}
          >
            {leaving() ? 'Replace and open' : 'Replace Oldest'}
          </Button>
        </div>
      </div>
    </>
  )
}
