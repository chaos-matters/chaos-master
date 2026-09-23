import { render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/contexts/ToastContext'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { ModalContext } from '../Modal/ModalContext'
import { createExportPngDialog } from './ExportPngDialog'
import type { RequestModalFn } from '../Modal/ModalContext'
import type { ExportImageType } from '@/flame/exportImageType'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/**
 * The flash export is the one path that both captures the canvas AND files the
 * flame in Recents, so it is where the line between an artifact and a document
 * is easiest to cross by accident: the canvas draws the authored flame with
 * this frame of audio modulation over it, so the PNG has to carry the flame
 * that produced those pixels while Recents goes on holding the document.
 */

const captured: { payloads: unknown[]; recents: FlameDescriptor[] } = {
  payloads: [],
  recents: [],
}

vi.mock('@/utils/jsonQueryParam', () => ({
  compressJsonQueryParam: (payload: unknown) => {
    captured.payloads.push(payload)
    return Promise.resolve(new Uint8Array([1, 2, 3]))
  },
}))

vi.mock('@/utils/flameInPng', () => ({
  addFlameDataToPng: () => new Blob([new Uint8Array([1])]),
}))

vi.mock('@/utils/recentFlames', () => ({
  saveRecentFlame: (flame: FlameDescriptor) => {
    captured.recents.push(flame)
    return 'saved'
  },
}))

vi.mock('@/utils/blob', () => ({
  downloadBlob: () => undefined,
}))

/** The authored document: what the user edited, and what Recents must hold. */
function authoredFlame(): FlameDescriptor {
  const flame = deepClone(Object.values(examples)[0] as FlameDescriptor)
  flame.renderSettings.exposure = 1
  return flame
}

/** What the canvas is drawing while a track plays - one modulated frame. */
function renderedFlame(): FlameDescriptor {
  const flame = authoredFlame()
  flame.renderSettings.exposure = 7
  return flame
}

/** A canvas that answers `toBlob` the way a real one does. */
function stubCanvas(): HTMLCanvasElement {
  return {
    toBlob: (callback: (blob: Blob | null) => void) => {
      callback(new Blob([new Uint8Array([137, 80, 78, 71])]))
    },
  } as unknown as HTMLCanvasElement
}

const requestModal = (() => Promise.resolve(undefined)) as RequestModalFn

/**
 * Mounts the dialog factory under the contexts it asks for, and hands back the
 * flash export together with the callback the renderer would be given.
 */
function mountQuickExport(
  authored: FlameDescriptor,
  rendered: FlameDescriptor,
  endPreview?: () => void,
) {
  const [onExportImage, setOnExportImage] = createSignal<
    ExportImageType | undefined
  >(undefined)
  let quickExport: () => void = () => undefined
  let showExportPngDialog: () => Promise<void> = () => Promise.resolve()
  /** Every read of the canvas flame, as it was at that moment. */
  const renderedReads: FlameDescriptor[] = []

  render(() => (
    <ModalContext.Provider value={requestModal}>
      <ToastProvider>
        {(() => {
          const dialog = createExportPngDialog(
            authored,
            () => {
              renderedReads.push(deepClone(rendered))
              return rendered
            },
            () => undefined,
            () => 1,
            () => undefined,
            setOnExportImage,
            () => undefined,
            () => undefined,
            () => 1,
            () => undefined,
            () => undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            endPreview,
          )
          quickExport = dialog.quickExport
          showExportPngDialog = () => dialog.showExportPngDialog()
          return null
        })()}
      </ToastProvider>
    </ModalContext.Provider>
  ))

  return { quickExport, showExportPngDialog, onExportImage, renderedReads }
}

beforeEach(() => {
  captured.payloads = []
  captured.recents = []
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the flash export', () => {
  it('embeds the flame that produced the pixels it captured', async () => {
    const { quickExport, onExportImage } = mountQuickExport(
      authoredFlame(),
      renderedFlame(),
    )

    quickExport()
    onExportImage()?.(stubCanvas(), { finalImageReady: true })
    await vi.waitFor(() => {
      expect(captured.payloads.length).toBe(1)
    })

    // The PNG is grabbed off the live canvas, so the flame inside it has to be
    // the modulated one: whoever loads the file back gets the image they were
    // shown, not a flame whose exposure the music had already moved.
    const payload = captured.payloads[0] as FlameDescriptor
    expect(payload.renderSettings.exposure).toBe(7)
  })

  it('leaves Recents holding the authored document', async () => {
    const { quickExport, onExportImage } = mountQuickExport(
      authoredFlame(),
      renderedFlame(),
    )

    quickExport()
    onExportImage()?.(stubCanvas(), { finalImageReady: true })
    await vi.waitFor(() => {
      expect(captured.recents.length).toBe(1)
    })

    // Recents is the user's work, not an artifact. Filing the modulated frame
    // here is the corruption the render-time overlay removed: one frame of a
    // song would become the flame they come back to.
    expect(captured.recents[0]?.renderSettings.exposure).toBe(1)
  })
})

/**
 * The partner gallery writes its hover preview into the document, and the
 * canvas draws it. An export pressed inside the gallery's 120 ms leave delay,
 * or Ctrl+E with the pointer resting on a tile, captured a partner nobody
 * picked, and filed it in Recents. The export ends the preview first, so the
 * pixels, the flame inside them and Recents all show the document.
 */
describe('an export over the gallery hover preview', () => {
  /** A document with a hovered partner in it, and the end that takes it off. */
  function hovered() {
    const doc = authoredFlame()
    doc.renderSettings.blendFlame = deepClone(examples.example2)
    const endPreview = vi.fn(() => {
      delete doc.renderSettings.blendFlame
    })
    return { doc, endPreview }
  }

  it('ends the preview before the flash export captures anything', async () => {
    const { doc, endPreview } = hovered()
    const { quickExport, onExportImage } = mountQuickExport(
      doc,
      doc,
      endPreview,
    )

    quickExport()
    onExportImage()?.(stubCanvas(), { finalImageReady: true })
    await vi.waitFor(() => {
      expect(captured.recents.length).toBe(1)
    })

    const payload = captured.payloads[0] as FlameDescriptor
    expect(payload.renderSettings.blendFlame).toBeUndefined()
    expect(captured.recents[0]?.renderSettings.blendFlame).toBeUndefined()
    expect(endPreview).toHaveBeenCalledTimes(1)
  })

  it('ends the preview before the export dialog snapshots the canvas', async () => {
    const { doc, endPreview } = hovered()
    const { showExportPngDialog, renderedReads } = mountQuickExport(
      doc,
      doc,
      endPreview,
    )

    await showExportPngDialog()

    expect(renderedReads.length).toBeGreaterThan(0)
    expect(renderedReads[0]?.renderSettings.blendFlame).toBeUndefined()
    expect(endPreview).toHaveBeenCalledTimes(1)
  })
})
