import { persistentSignal } from '@/utils/persistentSignal'

/**
 * Does a narration sentence get a step of its own?
 *
 * `lesson.note` is how an Arcade agent speaks, and routing it through a real
 * command is what puts the sentence in order inside the log. But a lesson
 * that narrates before every change ends up half narration steps — twenty
 * steps where ten of them move nothing — and the recorder already carries a
 * per-action `note` that exists precisely to caption a step in plain words.
 *
 * On (the default): each sentence is its own step, which is what a lesson
 * meant for a voiceover wants — the caption holds while nothing moves.
 * Off: the sentence is attached as the caption of the next real step, so the
 * step list is only the things that changed and every one of them explains
 * itself. Nothing is lost either way; a take recorded in one mode still
 * replays correctly if the toggle changes afterwards.
 */
export const [narrationAsStep, setNarrationAsStep] = persistentSignal(
  'recorder/narration-as-step',
  true,
)

/** The command whose whole purpose is to say something. */
export const NARRATION_COMMAND_ID = 'lesson.note'
