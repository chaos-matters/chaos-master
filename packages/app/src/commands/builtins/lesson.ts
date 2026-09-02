import { MAX_NARRATION_CHARS, pushNarration } from '@/arcade/narration'
import { registerCommand } from '../registry'

/**
 * The AI's voice as a recordable step.
 *
 * An Arcade lesson is only worth replaying if the explanation replays with
 * it, and the recorder already carries a per-action label. Routing narration
 * through a real command means the sentence lands in the `.steps.json`
 * between the edits it describes, in order, with no new file format.
 */
function isNarrationText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_NARRATION_CHARS
  )
}

registerCommand({
  id: 'lesson.note',
  label: 'Narration',
  description: 'A sentence the AI says about the step it is about to take',
  validateReplayArgs(args) {
    if (args.length !== 1 || !isNarrationText(args[0])) {
      return `narration expects one non-empty string of at most ${MAX_NARRATION_CHARS} characters`
    }
    return undefined
  },
  execute(_ctx, text?: unknown) {
    if (isNarrationText(text)) pushNarration(text)
  },
})
