/**
 * The export tracker draws its two glyphs with the app's own icons (@/icons)
 * rather than as text. Typed as the characters ▾ and ✕, their shape and
 * weight came from whatever font had them, and their strokes were thin
 * enough to be mostly anti-aliased edge: across the pixels each drew on the
 * dark desktop tracker, the median contrast was 5.68:1 and 4.53:1, where the
 * icons measure 6.81:1 and 7.31:1 in the same colour.
 */
import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { dismissJob, enqueueImageJob } from '@/utils/exportJobs'
import { ExportJobTracker } from './ExportJobTracker'
import type { ImageJobSpec } from '@/utils/exportJobs'

let job: string | undefined

afterEach(() => {
  if (job) dismissJob(job)
  job = undefined
  cleanup()
})

function trackOneJob() {
  job = enqueueImageJob({
    name: 'Aurora',
    flame: examples.example1,
  } as ImageJobSpec)
  render(() => <ExportJobTracker />)
}

describe('the export tracker', () => {
  it('turns its chevron as an icon, not a character', () => {
    trackOneJob()

    const header = screen.getByRole('button', { name: /Exports/ })
    expect(header.textContent).not.toContain('▾')
    expect(header.querySelector('svg')).not.toBeNull()
  })

  it('dismisses a job with an icon button, not a character', () => {
    trackOneJob()

    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss.textContent).not.toContain('✕')
    expect(dismiss.querySelector('svg')?.getAttribute('aria-hidden')).toBe(
      'true',
    )
  })
})
