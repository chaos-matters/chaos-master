/**
 * The export dialog hands a render to the export tracker and gets out of the
 * way, and its Close closes it while an export is running.
 *
 * Answering a modal used to take it down inside `startViewTransition`'s
 * callback, which the browser runs only once it has rendered a frame. An
 * export keeps the GPU busy and frames come late: in headed Chrome the dialog
 * stayed open and modal over the tracker for 2 s after Export Image, and a
 * Close pressed meanwhile was a second answer to it, so it did nothing.
 *
 * `startViewTransition` is stubbed with one that never runs its callback, a
 * renderer that has not produced that frame yet. jsdom has none of its own:
 * without the stub these tests would run the path of a browser without view
 * transitions, and pass either way.
 */
import { cleanup, fireEvent, render, screen, within, } from '@solidjs/testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { dismissJob, enqueueImageJob, exportJobs, setJobStatus, } from '@/utils/exportJobs'
import { ExportJobTracker } from '../ExportJobs/ExportJobTracker'
import { Modal } from '../Modal/Modal'
import { createExportPngDialog } from './ExportPngDialog'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ImageJobSpec } from '@/utils/exportJobs'

// The dialog's live preview is a WebGPU canvas, which jsdom cannot run.
vi.mock('@/lib/Root', () => ({ Root: () => null }))
vi.mock('@/lib/AutoCanvas', () => ({ AutoCanvas: () => null }))

beforeEach(() => {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: () => ({ ready: Promise.resolve(), finished: Promise.resolve() }),
  })
})

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition')
  for (const job of exportJobs()) dismissJob(job.id)
  cleanup()
})

function flame(): FlameDescriptor {
  return deepClone(examples.example1)
}

/**
 * The workspace's wiring of the dialog, reduced to what closing it touches:
 * the real modal host, the real job queue and the real tracker beside it.
 */
function mountExportDialog() {
  let dialog: ReturnType<typeof createExportPngDialog> | undefined
  render(() => (
    <ToastProvider>
      <Modal>
        <ExportJobTracker />
        {(() => {
          dialog = createExportPngDialog(
            flame(),
            flame,
            () => undefined,
            () => 1,
            () => undefined,
            () => undefined,
            () => undefined,
            () => undefined,
            () => 16 / 9,
            enqueueImageJob,
            () => undefined,
          )
          return null
        })()}
      </Modal>
    </ToastProvider>
  ))
  if (!dialog) throw new Error('the export dialog factory did not run')
  return dialog
}

function openExportDialog() {
  return document.querySelector<HTMLElement>('dialog[open]')
}

/** A button of the open dialog, not the tracker's button of the same name. */
function dialogButton(name: string) {
  const dialog = openExportDialog()
  if (!dialog) throw new Error('no export dialog is open')
  return within(dialog).getByRole('button', { name })
}

describe('the export dialog', () => {
  it('closes the moment Export Image queues the render, and the tracker shows it', async () => {
    const { showExportPngDialog, exportModalIsOpen } = mountExportDialog()

    const shown = showExportPngDialog()
    expect(openExportDialog()?.textContent).toContain('Render Flame')
    expect(exportModalIsOpen()).toBe(true)

    fireEvent.click(dialogButton('Export Image'))

    // Gone while the view transition is still waiting for its frame: the
    // render is the tracker's to show now, not the dialog's to hold.
    expect(document.querySelector('dialog')).toBeNull()
    await shown
    // The workspace canvas, frozen while the dialog was up, runs again.
    expect(exportModalIsOpen()).toBe(false)
    expect(exportJobs()).toHaveLength(1)
    expect(screen.getByText('Queued…')).toBeTruthy()
  })

  it.each([
    ['its Close button', 'Close modal'],
    ['its Cancel button', 'Cancel'],
  ])('closes on %s while an export is rendering', async (_, name) => {
    const id = enqueueImageJob({
      name: 'Aurora',
      flame: flame(),
    } as ImageJobSpec)
    setJobStatus(id, 'rendering')
    const { showExportPngDialog } = mountExportDialog()

    const shown = showExportPngDialog()
    const close = dialogButton(name)

    fireEvent.click(close)

    expect(document.querySelector('dialog')).toBeNull()
    await shown
    // Closing the dialog is not cancelling the export: the render goes on,
    // and the tracker still offers its Stop and Cancel.
    expect(exportJobs().map((job) => job.status)).toEqual(['rendering'])
    expect(screen.getByRole('button', { name: 'Stop & Export' })).toBeTruthy()
  })

  it('closes on Escape while an export is rendering', async () => {
    const id = enqueueImageJob({
      name: 'Aurora',
      flame: flame(),
    } as ImageJobSpec)
    setJobStatus(id, 'rendering')
    const { showExportPngDialog } = mountExportDialog()

    const shown = showExportPngDialog()
    expect(openExportDialog()).not.toBeNull()

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    expect(document.querySelector('dialog')).toBeNull()
    await shown
    expect(exportJobs().map((job) => job.status)).toEqual(['rendering'])
  })
})
