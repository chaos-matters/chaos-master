import { cleanup, render, screen } from '@solidjs/testing-library'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastHost } from '@/components/Toast/Toast'
import { ToastProvider } from '@/contexts/ToastContext'
import { Dropzone } from './Dropzone'

type FakeTransfer = {
  files?: File[]
  items?: { kind: string; getAsFile: () => File | null }[]
  types?: string[]
}

/** A drag event carrying a hand-built DataTransfer (happy-dom has none). */
function dragEvent(type: string, transfer: FakeTransfer = {}): Event {
  const ev = new Event(type, { bubbles: true, cancelable: true })
  const files = transfer.files ?? []
  Object.defineProperty(ev, 'dataTransfer', {
    value: {
      files: { length: files.length, item: (i: number) => files[i] ?? null },
      items: transfer.items ?? [],
      types: transfer.types ?? [],
      dropEffect: 'none',
    },
  })
  return ev
}

function setup() {
  const onDrop = vi.fn()
  // The zone tells the user when a drop arrives empty, so it needs the host.
  const { container } = render(() => (
    <ToastProvider>
      <ToastHost />
      <Dropzone onDrop={onDrop}>
        <div data-testid="child">child</div>
      </Dropzone>
    </ToastProvider>
  ))
  const zone = container.querySelector('.dropzone') as HTMLElement
  const child = container.querySelector('[data-testid="child"]') as HTMLElement
  return { zone, child, onDrop }
}

describe('Dropzone', () => {
  afterEach(cleanup)

  it('says so on screen when a drop arrives with nothing in it', async () => {
    // The failure the user actually hit: four drops, four console warnings
    // nobody sees, and the file they dropped got the blame for a drag that
    // never carried it. The console line stays for diagnosis; this is the
    // half a person can read.
    const { zone } = setup()
    zone.dispatchEvent(dragEvent('drop', { types: [] }))

    const toast = await screen.findByText(/drop arrived empty/i)
    expect(toast).toBeTruthy()
    // It has to say the file is not the problem, and where to go instead.
    expect(toast.textContent).toMatch(/Load Flame/)
  })

  it('clears the highlight and takes the drop even when no file arrives', () => {
    // A drop with no File (a URL dragged from another window, or a file
    // manager drop that Chromium delivered without the File objects) used to
    // leave the white border on screen and let the browser run its default,
    // which for a dropped URL is navigating away.
    const { zone, onDrop } = setup()
    zone.dispatchEvent(dragEvent('dragenter'))
    expect(zone.classList.contains('dropping')).toBe(true)

    const drop = dragEvent('drop', { types: ['text/uri-list'] })
    zone.dispatchEvent(drop)

    expect(zone.classList.contains('dropping')).toBe(false)
    expect(drop.defaultPrevented).toBe(true)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('hands the first dropped file to onDrop and clears the highlight', () => {
    const { zone, onDrop } = setup()
    const file = new File(['x'], 'flame.png', { type: 'image/png' })
    zone.dispatchEvent(dragEvent('dragenter'))
    zone.dispatchEvent(dragEvent('drop', { files: [file] }))

    expect(onDrop).toHaveBeenCalledWith(file)
    expect(zone.classList.contains('dropping')).toBe(false)
  })

  it('falls back to DataTransfer.items when files is empty', () => {
    const { zone, onDrop } = setup()
    const file = new File(['x'], 'flame.png', { type: 'image/png' })
    zone.dispatchEvent(
      dragEvent('drop', { items: [{ kind: 'file', getAsFile: () => file }] }),
    )
    expect(onDrop).toHaveBeenCalledWith(file)
  })

  it('keeps the highlight while the pointer moves between children', () => {
    const { zone, child } = setup()
    zone.dispatchEvent(dragEvent('dragenter'))
    // Moving onto a child fires dragenter on the child (it bubbles) and then
    // dragleave on the zone itself; a plain boolean turns the highlight off here.
    child.dispatchEvent(dragEvent('dragenter'))
    zone.dispatchEvent(dragEvent('dragleave'))
    expect(zone.classList.contains('dropping')).toBe(true)

    // Leaving the zone from the child is the last dragleave out.
    child.dispatchEvent(dragEvent('dragleave'))
    expect(zone.classList.contains('dropping')).toBe(false)
  })
})
