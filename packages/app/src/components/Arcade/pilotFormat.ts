import type { PilotEndReason } from '@/arcade/pilot'

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function reasonLabel(reason: PilotEndReason): string {
  switch (reason) {
    case 'finished':
      return 'Finished'
    case 'stopped':
      return 'Stopped by you'
    case 'budget':
      return 'Step budget reached'
    case 'error':
      return 'Ended after an error'
  }
}

/**
 * What the end card says about the library write. `saved` is undefined while
 * the write is still in flight, which is a real state the card can render.
 */
export function savedLine(sessionName: string, saved?: boolean): string {
  if (saved === false) return `Could not save "${sessionName}" to your library`
  if (saved === true) return `Saved to your library as "${sessionName}"`
  return `Saving "${sessionName}" to your library...`
}
