import { lastFinishedSession } from '@/recorder/recorder'
import { deepClone } from './clone'
import { persistentSignal } from './persistentSignal'
import type { RecordedSession } from '@/recorder/schema'

/**
 * Whether an exported file carries the recorded session that produced it.
 *
 * Shared rather than private to the export dialog because FOUR paths embed
 * metadata — the dialog's PNG job, the no-dialog quick export, the inline MP4
 * export and the offscreen MP4 job — and a checkbox that only reached one of
 * them would be quietly lying about the other three.
 *
 * Opt-out rather than silent: the session describes the whole editing process
 * and adds weight to every exported file.
 */
export const [embedStepsInExports, setEmbedStepsInExports] = persistentSignal(
  'export/embed-steps',
  true,
)

/** The session to embed, or undefined when there is none or the user has
 *  turned embedding off. Every export path asks this one question. */
export function sessionForExport(): RecordedSession | undefined {
  return embedStepsInExports() ? lastFinishedSession() : undefined
}

/** Detach a session from mutable recorder state at the moment an export starts.
 * Delayed canvas callbacks and video finalizers must carry this value rather
 * than asking for the latest finished recording when they eventually run. */
export function snapshotExportSession(
  session: RecordedSession | undefined,
): RecordedSession | undefined {
  return session === undefined ? undefined : deepClone(session)
}
