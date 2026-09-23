/**
 * The recorded form of Play and Pause: `timeline.setPlaying(playing, frame)`,
 * with a third count on a stop (the frames the playback advanced, see
 * recorder/playWindows.ts), and the words for the one kind of transport a
 * take still cannot record.
 *
 * A leaf, like `documentWriteHook.ts`, because both ends need it and neither
 * may import the other: the command registers under this id and describes
 * itself with this label, and the recorder writes the same id and label when
 * the timeline reports a start or stop. One definition keeps a recorded step
 * and a replayed one from ever reading differently in the step list.
 */

export const TIMELINE_PLAYBACK_COMMAND_ID = 'timeline.setPlaying'

/** A stop's count of frames advanced: any whole number, since it may loop. */
export const isAdvanceCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** `still` names the step a take ends on when it stops while playing: the
 *  playback carries on from there rather than starting. */
export function describeTimelinePlayback(
  playing: boolean,
  frame: number,
  still = false,
): string {
  if (!playing) return `Pause at frame ${frame}`
  return still ? `Still playing at frame ${frame}` : `Play from frame ${frame}`
}

/**
 * Why a raw playhead move is an uncaptured step, as the recorder panels show
 * it. A seek made through a command is a step of its own; one made directly on
 * the raw timeline is not, and a take lists only the first (see
 * `reportTimelineTransportIn` in recorder.ts), which the words say.
 */
export const PLAYHEAD_MOVE_REASON =
  'Playhead moved outside the recorded commands (counted once per take)'
