/**
 * Bundled CC0 audio tracks for Beats mode.
 */

export interface BundledTrack {
  id: string
  name: string
  artist: string
  bpm: number
  duration: number
  url: string
  description: string
}

export const BUNDLED_TRACKS: readonly BundledTrack[] = [
  {
    id: 'ember-drift',
    name: 'Ember Drift',
    artist: 'Lumen Studio (CC0)',
    bpm: 100,
    duration: 12,
    url: '/audio/ember-drift.wav',
    description:
      'Warm ambient synth chords with deep sub-bass pulse at 100 BPM.',
  },
  {
    id: 'cyber-pulse',
    name: 'Cyber Pulse',
    artist: 'Lumen Studio (CC0)',
    bpm: 120,
    duration: 10,
    url: '/audio/cyber-pulse.wav',
    description:
      'Driving electronic rhythm with punchy bass arpeggio at 120 BPM.',
  },
] as const

export function getBundledTrack(id: string): BundledTrack | undefined {
  return BUNDLED_TRACKS.find((track) => track.id === id)
}

/** A bundled track by id or display name, ignoring case and surrounding space. */
export function findBundledTrack(nameOrId: string): BundledTrack | undefined {
  const key = nameOrId.trim().toLowerCase()
  return BUNDLED_TRACKS.find(
    (track) => track.id === key || track.name.toLowerCase() === key,
  )
}

export async function fetchBundledTrackBuffer(
  track: BundledTrack,
): Promise<ArrayBuffer> {
  const response = await fetch(track.url)
  if (!response.ok) {
    throw new Error(
      `Failed to load bundled track "${track.name}": HTTP ${response.status}`,
    )
  }
  return response.arrayBuffer()
}
