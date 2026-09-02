import { createSignal } from 'solid-js'

/**
 * What the agent last said, and everything it has said this take.
 *
 * Written only by the `lesson.note` command, never by a tool directly, so a
 * narration line is recorded like any other step and replays as a caption.
 * Read by the pilot overlay's live rail.
 */
export const MAX_NARRATION_CHARS = 400
export const MAX_NARRATION_LOG = 200

const [narration, setNarration] = createSignal<string | undefined>()
const [narrationLog, setNarrationLog] = createSignal<
  { t: number; text: string }[]
>([])

export { narration, narrationLog }

export function pushNarration(text: string): void {
  setNarration(text)
  setNarrationLog((log) => [
    ...log.slice(-(MAX_NARRATION_LOG - 1)),
    { t: Date.now(), text },
  ])
}

export function clearNarration(): void {
  setNarration(undefined)
  setNarrationLog([])
}
