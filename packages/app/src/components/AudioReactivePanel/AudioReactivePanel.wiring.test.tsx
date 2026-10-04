/**
 * The wiring editor opens over the whole window, wherever the audio panel
 * is. The panel lives in the desktop sidebar, which is a backdrop-filtered
 * box while it floats over the canvas as glass (App.module.css,
 * .sidebarGlass), and a fixed box inside one is held to it and clipped: the
 * editor opened as a strip the sidebar's size. So it renders from the body,
 * outside the panel.
 */
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, } from 'vitest'
import { AudioReactivePanel } from './AudioReactivePanel'

// The test runner's own localStorage is not a working Storage, and the
// editor reads the view it was last left in from it.
const stored = new Map<string, string>()
const memoryStorage: Storage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => {
    stored.set(key, value)
  },
  removeItem: (key) => {
    stored.delete(key)
  },
  clear: () => {
    stored.clear()
  },
  key: (index) => [...stored.keys()][index] ?? null,
  get length() {
    return stored.size
  },
}

// The panel loads the editor lazily, as a chunk of its own. Loading it here
// first keeps its first transform out of findByTitle's one-second wait, which
// a full test run under load outlasted.
beforeAll(async () => {
  await import('../AudioWiringModal/AudioWiringModal')
})

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  stored.clear()
})

function mountPanel() {
  const noop = () => {}
  return render(() => (
    <AudioReactivePanel
      onClose={noop}
      audioBuffer={() => undefined}
      onAudioChange={noop}
      audioMapping={() => ({ preset: 'custom', mappings: [] })}
      onMappingChange={noop}
      audioEnabled={() => false}
      onEnabledChange={noop}
      audioSource={() => 'file'}
      onSourceChange={noop}
      onLiveAnalyzerChange={noop}
      liveAnalyzer={() => undefined}
      playbackPaused={() => true}
      onPausedChange={noop}
      playbackTime={() => 0}
      onSeek={noop}
      fileAnalyzer={() => undefined}
      analysisProgress={() => null}
      keepPlayingWhenClosed={() => false}
      onKeepPlayingChange={noop}
      transforms={[]}
    />
  ))
}

describe('the wiring editor', () => {
  it('opens from the body, not inside the panel', async () => {
    const { container } = mountPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Open wiring editor' }))

    // The editor's own header, which loads with it.
    const editor = await screen.findByTitle(
      'Copy the current wiring to the clipboard as JSON',
    )
    expect(container.contains(editor)).toBe(false)
    expect(document.body.contains(editor)).toBe(true)
  })
})
