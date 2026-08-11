/**
 * A leaf seam between document owners and the recorder.
 *
 * The timeline needs to tell the recorder that an entry landed on its undo
 * stack — but importing `recorder/recorder.ts` from `utils/timeline.ts` closes
 * a cycle: the flame schema reaches the timeline through the variation
 * parameter editors, and the recorder reaches the flame schema through the
 * session format. The result was a half-initialised valibot schema and every
 * flame failing to parse.
 *
 * So this module holds nothing but a function reference. It imports nothing,
 * which is the whole point — anyone may depend on it. `recorder/recorder.ts`
 * installs the real reporter when it loads; until then the calls are no-ops,
 * which is correct, because with no recorder loaded there is no recording.
 */

type DocumentWriteReporter = (description?: string) => void

let reporter: DocumentWriteReporter | undefined

export function setDocumentWriteReporter(fn: DocumentWriteReporter): void {
  reporter = fn
}

export function notifyDocumentWrite(description?: string): void {
  reporter?.(description)
}
