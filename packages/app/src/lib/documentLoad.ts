/**
 * What a flush of the open document's unsaved work did.
 *
 * `full` is the one outcome that is a question rather than a result: Recents
 * is at its cap, the only way to make room is to destroy a flame the user
 * chose to keep, and no automatic path may decide that
 * (utils/recentFlames.ts). `refused` is storage saying no - a quota, a
 * private window - and there is nothing to ask about.
 */
export type FlushOutcome = 'clean' | 'saved' | 'full' | 'refused'

/**
 * Swap the document the editor is holding for another one.
 *
 * The order is the whole of it. `flushUnsaved` reads the OUTGOING flame and
 * its tracks and writes them to Recents; `replace` drops them. Run the other
 * way round, or not at all, and opening a flame destroys whatever was
 * unsaved in the one before it - which is what every way into the Library
 * except the desktop's own Load button used to do, because the flush lived
 * on that button rather than at the replacement.
 *
 * So it lives here, with a name, and every document replacement in
 * MainWorkspace goes through it: the Library load, the hand-off from the
 * welcome grid and Home, a randomizer-history load, New Flame, and the 2D/3D
 * switch, whose stash is in memory only. Three of those were still flushing
 * by hand while this said there were two - the claim is checked now, by a
 * test that fails on any call of the flush outside this function
 * (documentLoad.test.ts).
 *
 * A flush that wrote nothing stops the replacement, and that is the point. At
 * the cap, and when storage refuses the write, the flush writes nothing - so
 * going ahead destroys the open document's unsaved work outright, with the
 * toast explaining it painting after the work is already gone, and undo
 * restoring the flame but not the keyframe tracks. Which of the two things
 * gives way is the user's answer to give, and the caller settles it before it
 * gets here (MainWorkspace's `prepareDocumentReplacement`). Reaching this
 * with anything but `clean` or `saved` therefore means the question was
 * skipped, and then the document on screen is the one worth keeping: it is
 * the work the user can see.
 *
 * `refused` used to fall through here as if the write had landed, because
 * only `full` was tested for. Storage saying no is not a reason to destroy
 * anything - it is the reason there is nowhere else for the work to be.
 *
 * Deliberately synchronous, which is why the asking happens before it rather
 * than inside. The Library path calls this from inside a `batch` that also
 * seeds the incoming animation, and the load-boundary baseline is taken by
 * the effect that batch schedules - so a replacement deferred across an
 * await would be baselined against the OUTGOING flame, and the freshly
 * loaded document would read as unsaved work from the moment it opened.
 *
 * @returns whether the new document actually went in.
 */
export function replaceOpenDocument(steps: {
  /** Put whatever the open document is holding somewhere it survives. */
  flushUnsaved: () => FlushOutcome
  /** Then, and only then, put the new document in its place. */
  replace: () => void
}): boolean {
  const flushed = steps.flushUnsaved()
  if (flushed !== 'clean' && flushed !== 'saved') return false
  steps.replace()
  return true
}
