import { createEffect, onCleanup } from 'solid-js'
import { filesFromDataTransfer } from '@/utils/dataTransferFiles'
import { createFileDragState } from '@/utils/fileDragState'
import ui from './Dropzone.module.css'
import type { ParentProps } from 'solid-js'

function preventDraggingAnyElement() {
  createEffect(() => {
    function preventDefault(ev: Event) {
      ev.preventDefault()
    }
    document.addEventListener('dragstart', preventDefault)
    onCleanup(() => {
      document.removeEventListener('dragstart', preventDefault)
    })
  })
}

type DropzoneProps = {
  class?: string
  onDrop: (file: File) => void | Promise<void>
}

export function Dropzone(props: ParentProps<DropzoneProps>) {
  // Shared with the Load Flame modal's own zone so the two cannot drift — they
  // already had different enter/leave behaviour, and only one of them flickered.
  const fileDrag = createFileDragState()
  const dropping = fileDrag.active

  preventDraggingAnyElement()

  return (
    <div
      class={ui.dropzone}
      classList={{
        [props.class ?? '']: true,
        [ui.dropping as string]: dropping(),
      }}
      onDragEnter={fileDrag.onDragEnter}
      onDragLeave={fileDrag.onDragLeave}
      onDragOver={fileDrag.onDragOver}
      onDrop={(ev) => {
        // Take every drop, with or without a file. The browser's default for a
        // dropped URL is navigating away, and the highlight has to clear either
        // way: it used to stay on when the payload carried no File.
        ev.preventDefault()
        fileDrag.reset()
        const [file] = filesFromDataTransfer(ev.dataTransfer)
        if (!file) {
          console.warn(
            'Dropzone: drop carried no file; types:',
            Array.from(ev.dataTransfer?.types ?? []),
          )
          return
        }
        const report = (err: unknown) => {
          console.error('Dropzone onDrop handler failed:', err)
        }
        try {
          // onDrop may be async (e.g. it loads/parses the file) — surface
          // a rejection instead of letting it become an unhandled rejection.
          Promise.resolve(props.onDrop(file)).catch(report)
        } catch (err) {
          report(err)
        }
      }}
    >
      {props.children}
    </div>
  )
}
