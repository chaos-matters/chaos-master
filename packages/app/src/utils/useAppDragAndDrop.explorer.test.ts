/**
 * Dropping a PNG on the editor, with the real file reader: a deep-zoom
 * picture opens the explorer at its location in this tab, and a flame PNG
 * loads into the editor exactly as before.
 */
import { DEFAULT_LOCATION, formatExplorerHash } from '@chaos-master/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { examples } from '@/flame/examples'
import { EXPLORER_PATH } from '@/routing/appPath'
import { askBeforeLeavingForExplorer } from '@/routing/pageLinks'
import { deepClone } from './clone'
import { addExplorerLocationToPng, addFlameDataToPng } from './flameInPng'
import { compressJsonQueryParam } from './jsonQueryParam'
import { useAppDragAndDrop } from './useAppDragAndDrop'
import type { ExplorerLocation } from '@chaos-master/core'

const alert = vi.hoisted(() => vi.fn(() => Promise.resolve()))

vi.mock('@/components/Modal/useAlert', () => ({
  useAlert: () => alert,
}))

const LOCATION: ExplorerLocation = {
  ...DEFAULT_LOCATION,
  kind: 'julia',
  view: { centerRe: '0.25', centerIm: '-0.125', zoomLog2: 40.5 },
  juliaC: { re: '-0.12256', im: '0.74486' },
  colourCycle: 181,
  relief: 0.8,
}

const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

afterEach(() => {
  vi.unstubAllGlobals()
  alert.mockClear()
})

function dropTarget() {
  const replace = vi.fn()
  const prepareReplace = vi.fn(() => Promise.resolve(true))
  const setLoadedAnimation = vi.fn()
  const onDrop = useAppDragAndDrop(
    { replace, prepareReplace },
    setLoadedAnimation,
  )
  const assign = vi.fn()
  vi.stubGlobal('location', { assign })
  return { onDrop, replace, prepareReplace, setLoadedAnimation, assign }
}

describe('dropping a PNG on the editor', () => {
  it('opens the explorer at the location a deep-zoom PNG carries', async () => {
    const png = await addExplorerLocationToPng(PNG_SIGNATURE, LOCATION)
    const target = dropTarget()

    await target.onDrop(new File([png], 'Julia set.png', { type: 'image/png' }))

    expect(target.assign).toHaveBeenCalledExactlyOnceWith(
      `${EXPLORER_PATH}${formatExplorerHash(LOCATION)}`,
    )
    // Leaving is not a document replacement: nothing is loaded or asked.
    expect(target.replace).not.toHaveBeenCalled()
    expect(target.prepareReplace).not.toHaveBeenCalled()
    expect(target.setLoadedAnimation).not.toHaveBeenCalled()
    expect(alert).not.toHaveBeenCalled()
  })

  it('stays in the editor when the editor says no to leaving', async () => {
    // At a full Recents the editor asks first (hooks/useWorkspaceAutosave.ts).
    const ask = vi.fn(() => Promise.resolve(false))
    const dispose = askBeforeLeavingForExplorer(ask)
    try {
      const png = await addExplorerLocationToPng(PNG_SIGNATURE, LOCATION)
      const target = dropTarget()

      await target.onDrop(
        new File([png], 'Julia set.png', { type: 'image/png' }),
      )

      expect(ask).toHaveBeenCalledOnce()
      expect(target.assign).not.toHaveBeenCalled()
      expect(target.replace).not.toHaveBeenCalled()
      expect(target.prepareReplace).not.toHaveBeenCalled()
    } finally {
      dispose()
    }
  })

  it('loads a flame PNG into the editor as before', async () => {
    const flame = deepClone(examples.example1)
    const png = addFlameDataToPng(
      await compressJsonQueryParam(flame),
      PNG_SIGNATURE,
    )
    const target = dropTarget()

    await target.onDrop(new File([png], 'Flame.png', { type: 'image/png' }))

    expect(target.assign).not.toHaveBeenCalled()
    expect(target.prepareReplace).toHaveBeenCalledOnce()
    expect(target.replace).toHaveBeenCalledOnce()
    expect(target.replace.mock.calls[0]?.[1]).toBe('Drop flame')
    expect(
      Object.keys(target.replace.mock.calls[0]?.[0].transforms ?? {}),
    ).toEqual(Object.keys(flame.transforms))
    expect(alert).not.toHaveBeenCalled()
  })

  it('says so when a PNG carries neither', async () => {
    const target = dropTarget()

    await target.onDrop(
      new File([PNG_SIGNATURE], 'Holiday.png', { type: 'image/png' }),
    )

    expect(target.assign).not.toHaveBeenCalled()
    expect(target.replace).not.toHaveBeenCalled()
    expect(alert).toHaveBeenCalledExactlyOnceWith(
      "No valid flame found in 'Holiday.png'.",
    )
  })
})
