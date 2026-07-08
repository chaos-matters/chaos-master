# Audio Playback Controls Plan

## Problem
The user uploads an audio file and clicks "Live Preview" — the song plays on loop with no way to pause, stop, or seek to a different section. The waveform is purely visual. The user wants to:
1. Pause/resume playback
2. See the current playhead position on the waveform
3. Click or drag on the waveform to seek/jump to that section

## Architecture Insight

`useAudioReactive` currently creates an `AudioContext` + `AudioBufferSourceNode` inside a single `createEffect` whose `onCleanup` destroys everything. For pause/seek support, the `AudioContext` must persist across pause/resume cycles.

### Key design decisions
- **`AudioContext.suspend()` / `resume()`** for pause (keeps the context alive, no re-creation needed)
- **New `AudioBufferSourceNode`** for seek (can't seek a running source — stop it, create a new one from the target offset)
- **Closure-scope variables** for `audioCtx`, `sourceNode`, `analyzer` (lifted out of `createEffect`)
- **Offset tracking**: track `playbackOffset` (seconds into the buffer) = `audioCtx.currentTime - sourceStartTime + seekBaseOffset`

---

## Step 1: New signals in MainWorkspace

Add 3 signals:

```ts
const [playbackPaused, setPlaybackPaused] = createSignal(false)
const [seekTarget, setSeekTarget] = createSignal<number | null>(null)
const [playbackTime, setPlaybackTime] = createSignal(0)
```

Pass them to `AudioReactivePanel` and `useAudioReactive`.

---

## Step 2: Modify `useAudioReactive.ts`

### Signature change
Add 3 params:
```ts
playbackPaused: Accessor<boolean>,
seekTarget: Accessor<number | null>,
onPlaybackTime: (seconds: number) => void,
```

### Internal refactor
- Lift `audioCtx`, `sourceNode`, `analyzer` to closure scope (outside `createEffect`)
- Track: `let seekBaseOffset = 0`, `let sourceStartTime = 0`
- The `createEffect` still reacts to `audioEnabled`, `audioBuffer` changes
- A second `createEffect` reacts to `playbackPaused`:
  - `true` → `audioCtx.suspend()`
  - `false` → `audioCtx.resume()` + create new source if needed
- A third `createEffect` reacts to `seekTarget`:
  - If non-null: stop current source → create new one at `seekTarget` seconds → reset `seekBaseOffset`

### Current time calculation
```ts
const currentTime = (audioCtx.currentTime - sourceStartTime) + seekBaseOffset
```

---

## Step 3: Modify `AudioReactivePanel`

### New props
```ts
playbackPaused: Accessor<boolean>
onPausedChange: (p: boolean) => void
playbackTime: Accessor<number>
onSeek: (seconds: number) => void
```

### UI changes in file-mode loaded state (between audioInfo and waveform)

1. **Playback controls row** (above waveform):
   - Play/Pause button (▶ / ⏸ icon using text/SVG)
   - Time display: `M:SS / M:SS` format

2. **Waveform canvas** (existing, add interactivity):
   - `onClick` → calculate `(e.offsetX / canvasWidth) * duration`, call `onSeek()`
   - Draw playhead: vertical line at `(playbackTime / duration) * canvasWidth`
   - Redraw canvas on `playbackTime` changes (via `createEffect`)
   - `cursor: pointer` CSS on canvas

---

## Step 4: Wire in `MainWorkspace`

- Pass `playbackPaused`, `setPlaybackPaused`, `playbackTime`, `setSeekTarget` to `AudioReactivePanel`
- Pass `playbackPaused`, `seekTarget`, `setPlaybackTime` to hook call

---

## Step 5: CSS additions

- `.playbackRow` — flex row with play button + time
- `.playPauseBtn` — circular button
- `.timeText` — monospace time display
- `.waveform` gets `cursor: pointer`
