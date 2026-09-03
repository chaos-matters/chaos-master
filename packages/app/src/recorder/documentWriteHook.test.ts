import { afterEach, describe, expect, it } from 'vitest'
import { createTestFlame } from '@/webmcp/testUtils'
import { notifyDocumentWrite, notifyTimelineTransport, } from './documentWriteHook'
import { recorderStream } from './recorder'

/**
 * The hook is the one seam with no CommandContext — it exists to break an
 * import cycle — so the seat has to arrive as an argument from whichever
 * store owns the write.
 */
describe('documentWriteHook seat routing', () => {
  const flame = createTestFlame()

  afterEach(() => {
    recorderStream('player').cancel()
    recorderStream('rival').cancel()
  })

  it('sends an unattributed write to the player stream', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    notifyDocumentWrite('timeline edit')
    expect(player.unnamedWriteCount()).toBe(1)
    expect(rival.unnamedWriteCount()).toBe(0)
  })

  it('sends a seated write only to that seat', () => {
    const player = recorderStream('player')
    const rival = recorderStream('rival')
    player.start(flame)
    rival.start(flame)
    notifyDocumentWrite('timeline edit', 'rival')
    expect(player.unnamedWriteCount()).toBe(0)
    expect(rival.unnamedWriteCount()).toBe(1)
  })

  it('routes transport the same way', () => {
    const rival = recorderStream('rival')
    rival.start(flame)
    notifyTimelineTransport('Timeline playback transport', 'rival')
    expect(rival.unnamedWriteCount()).toBe(1)
    expect(recorderStream('player').unnamedWriteCount()).toBe(0)
  })
})
