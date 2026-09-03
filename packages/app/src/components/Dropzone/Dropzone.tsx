import { createEffect, createSignal, onCleanup } from 'solid-js'
import { filesFromDataTransfer } from '@/utils/dataTransferFiles'
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
  const [dropping, setDropping] = createSignal(false)
  // dragenter/dragleave fire for every element the pointer crosses and bubble
  // up here, so a plain boolean flips off each time the pointer moves onto a
  // child. Count the nesting instead; a drop, or a leave to somewhere outside
  // the zone, resets it.
  let depth = 0

  const reset = () => {
    depth = 0
    setDropping(false)
  }

  preventDraggingAnyElement()

  return (
    <div
      class={ui.dropzone}
      classList={{
        [props.class ?? '']: true,
        [ui.dropping as string]: dropping(),
      }}
      onDragEnter={() => {
        depth += 1
        setDropping(true)
      }}
      onDragLeave={(ev) => {
        const next = ev.relatedTarget
        // Browsers that report where the pointer went (Chromium, Firefox) let
        // a leave to outside the zone clear the highlight even if the count
        // drifted; the others fall back to the counter.
        if (next instanceof Node && !ev.currentTarget.contains(next)) {
          reset()
          return
        }
        depth = Math.max(0, depth - 1)
        if (depth === 0) setDropping(false)
      }}
      onDragOver={(ev) => {
        // needed for drop to work
        ev.preventDefault()
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(ev) => {
        // Take every drop, with or without a file. The browser's default for a
        // dropped URL is navigating away, and the highlight has to clear either
        // way: it used to stay on when the payload carried no File.
        ev.preventDefault()
        reset()
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
