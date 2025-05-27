import { Button } from '../Button/Button'
import { useRequestModal } from './ModalContext'
import { ModalTitleBar } from './ModalTitleBar'
import type { JSX } from 'solid-js'

export function useAlert() {
  const requestModal = useRequestModal()
  return (message: string | JSX.Element) =>
    requestModal({
      content: ({ respond }) => (
        <>
          <ModalTitleBar>{message}</ModalTitleBar>
          <Button
            style={{ 'align-self': 'flex-end' }}
            onClick={() => {
              respond()
            }}
          >
            Ok
          </Button>
        </>
      ),
    })
}
