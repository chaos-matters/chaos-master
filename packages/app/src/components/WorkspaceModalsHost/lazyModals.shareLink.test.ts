/**
 * The share link over the partner gallery's hover preview.
 *
 * The modal builds its link, copies it to the clipboard and uploads a canvas
 * capture as the link's preview card, all from the document, as soon as it
 * opens. Opened inside the gallery's 120 ms leave delay it shared a partner
 * nobody picked, so opening it ends the preview first.
 */
import { createRoot } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from '@/utils/clone'
import { createLazyShareLinkModal } from './lazyModals'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

/** The document as the modal found it when it opened. */
const opened: FlameDescriptor[] = []

vi.mock('@/components/ShareLinkModal/ShareLinkModal', () => ({
  createShareLinkModal: (flame: FlameDescriptor) => ({
    showShareLinkModal: () => {
      opened.push(deepClone(flame))
      return Promise.resolve()
    },
  }),
}))

describe('the share link', () => {
  it('ends the hover preview before the modal reads the document', async () => {
    const doc = deepClone(examples.example1)
    doc.renderSettings.blendFlame = deepClone(examples.example2)
    const endPreview = vi.fn(() => {
      delete doc.renderSettings.blendFlame
    })
    const { showShareLinkModal } = createRoot(() =>
      createLazyShareLinkModal(
        doc,
        () => [],
        () => ({}) as never,
        undefined,
        endPreview,
      ),
    )

    await showShareLinkModal()

    expect(opened).toHaveLength(1)
    expect(opened[0]?.renderSettings.blendFlame).toBeUndefined()
    expect(endPreview).toHaveBeenCalledTimes(1)
  })
})
