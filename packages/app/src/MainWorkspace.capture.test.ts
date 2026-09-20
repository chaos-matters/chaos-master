import { describe, expect, it } from 'vitest'
import source from './MainWorkspace.tsx?raw'

/**
 * A post carries the flame that produced its pixels - in the image and in the
 * link beside it; anything persisted as the user's work carries the authored
 * flame.
 *
 * The two share captures live inside MainWorkspace, which no test can mount -
 * it is the whole editor, a WebGPU root and a dozen contexts - so the rule is
 * read out of the source the way the Home gallery's is (HomeTab.community.
 * test.ts). The flash export, which is reachable, proves the same rule end to
 * end in ExportPngDialog/quickExport.test.tsx.
 */
const code = source.replace(/\s+/g, ' ')

describe('the share captures', () => {
  it('freeze the flame behind the frame they grabbed', () => {
    // Both captures take pixels off the LIVE canvas, which draws the authored
    // flame with this frame of audio modulation over it. Frozen at the moment
    // the frame lands, because the encode that follows is async and the audio
    // loop publishes a new overlay 30 times a second.
    const frozen = code.match(/capturedFlame = deepClone\(renderedFlame\(\)\)/g)
    expect(
      frozen ?? [],
      'both captures freeze the rendered flame',
    ).toHaveLength(2)
  })

  it('embed that flame in the share-link preview', () => {
    // The preview image is what a link unfurls to. Embedding the document
    // instead gave anyone who downloaded it a flame that renders differently
    // from the picture they were looking at.
    expect(code).toContain(
      '? { flame: capturedFlame, animation: { tracks, config } } : capturedFlame',
    )
  })

  it('embed that flame in the PNG posted to Discord', () => {
    expect(code).toContain('flame: postedFlame, animation, customVariations:')
  })

  it('hand the same flame to the link beside the image', () => {
    // One post is one artifact. The PNG carried the captured frame while the
    // link and the showcase entry carried the authored document, so while a
    // track played, "Copy share link" under the picture handed someone a
    // flame that does not look like it. One binding now, read by all three.
    expect(code).toContain('const postedFlame = capturedFlame')
    expect(code).toContain('createShareLink({ flame: postedFlame,')
    expect(code).toContain('flame: postedFlame, animation, shareUrl:')
  })
})

describe('the writes that keep a document', () => {
  it('files the document in Recents, never a modulated frame', () => {
    // Save for Later is the user's own save.
    expect(code).toContain(
      'saveRecentFlame(flameDescriptor, undefined, tracks, force, config)',
    )
  })

  it('autosaves and writes the pause save from the document', () => {
    // The autosave hook is handed the store once; the write it makes when the
    // native app is backgrounded, and the flush at a load boundary, both read
    // from it. Hand it `renderedFlame` and every one of them files a frame of
    // a song as the open document.
    expect(code).toContain('useWorkspaceAutosave({ flameDescriptor,')
  })
})
