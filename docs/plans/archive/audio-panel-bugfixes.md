# Audio Panel Bugfixes & Polish

## Bugs Identified

### 1. Waveform Disappears on Source Switch (file↔mic)

**Root cause**: Solid's `<Show when={audioSource() === 'file'}>` destroys/recreates the canvas DOM element when toggling. The `createEffect` at `AudioReactivePanel.tsx:406` only watches `audioBuffer()` and `fileAnalyzer()`, neither of which change during a source toggle. The `waveformCanvas` ref is a plain `let` variable (not reactive), so the effect never re-runs after the canvas is recreated.

**Fix**: Add `audioSource` as a dependency in the waveform-drawing effect, AND reset the beat cache on source switch. Change the effect to:

```ts
createEffect(() => {
  const buffer = props.audioBuffer()
  const analyzer = props.fileAnalyzer()
  const source = props.audioSource()
  const canvas = waveformCanvas
  if (!buffer || !analyzer || !canvas || source !== 'file') return
  // ... rest of drawing logic
})
```

Also, after the canvas ref is re-bound, the effect needs to re-trigger. Since Solid refs aren't reactive, use a `createSignal<HTMLCanvasElement | undefined>` for the canvas ref so it participates in reactivity.

### 2. Playhead Jumps on Source Switch & Pause Quirks

**Root cause**: `useAudioReactive.ts` maintains `seekBaseOffset` and `sourceStartTime` as closure variables. When switching file→mic→file:

- File cleanup sets `seekBaseOffset = 0` (line 188)
- But the `playbackTime` signal in MainWorkspace retains its old value until the first tick (~33ms later)
- The old playhead position is briefly displayed, causing a "jump"
- Additionally, `paused` closure variable keeps stale state across source transitions

**Fix in `useAudioReactive.ts`**:

1. Call `onPlaybackTime(0)` in the file mode's `onCleanup` to immediately reset the display
2. Reset `paused = false` in the file mode's `onCleanup` to prevent stale suspend on re-create

**Fix in `MainWorkspace.tsx`**: In `onAudioChange`, also reset `playbackTime`:

```ts
setPlaybackTime(0)
```

### 3. Beat Markers (Red Lines) Too Intrusive on Waveform

**Root cause**: In `audioWaveform.ts:70-79`, beat markers are drawn as full-height vertical lines (`moveTo(x, 0); lineTo(x, height)`) with color `rgba(255, 120, 80, 0.6)` — bright orange-red at 60% opacity, spanning the entire waveform vertically. This overwhelms the waveform visualization.

**Fix**: Change beat markers from full-height lines to small tick marks:

- Draw ticks at top and bottom only (4px tall each), or
- Use dot markers centered vertically (2px radius circles), or
- Reduce opacity to 0.3 and line width to 0.5px

Best approach: small vertical ticks (6px tall) at the top of the waveform, with reduced opacity (`0.25`). Beat info is still visible but non-destructive:

```ts
// Beat tick marks at top
const tickH = 6
ctx.strokeStyle = 'rgba(255, 140, 100, 0.25)'
ctx.lineWidth = 1
for (const frame of beats) {
  const x = (frame / totalFrames) * width
  ctx.beginPath()
  ctx.moveTo(x, 0)
  ctx.lineTo(x, tickH)
  ctx.stroke()
}
```

Additionally, add a subtle bottom tick and a thin center line connecting them for the beat grid feel without overwhelming the waveform.

### 4. Audio Analysis (Beat Computation) Blocks UI

**Root cause**: Two layers of blocking:

**a) Initial FFT analysis** (`createAudioAnalyzer` in `audioAnalysis.ts:327-329`): The entire frame table is pre-computed synchronously in a tight loop. For a 3-minute song at 30fps = ~5400 FFT frames. Each `getOrComputeFrame(i)` does channel mixing + FFT computation. The `onProgress` callback fires but the browser can't paint because JS is blocked.

**b) Beat frame scanning** (`computeBeatFrames` in `audioWaveform.ts:24-27`): After the analyzer is built, `AudioReactivePanel.tsx:415` calls `computeBeatFrames` which iterates all frames synchronously checking `isBeat`.

**Fix**: Make both computations yield to the browser periodically using chunked processing:

For `createAudioAnalyzer`: Accept the `onProgress` it already has, but batch frames in groups of ~100 and yield with `setTimeout(fn, 0)` between batches.

For `computeBeatFrames`: Same approach — process in chunks of ~200 frames with `setTimeout` yielding.

The existing `onProgress` callback already updates a signal (`beatProgress`), so the UI will show real progress as chunks complete.

### 5. (Bonus) Play/Pause State on Source Switch

The `paused` closure variable in `useAudioReactive.ts` persists across effect re-runs. When switching mic→file while playback was previously paused, `createSource` starts the node and then `if (paused)` suspends it — correct behavior. But the UI play/pause button might not match because `playbackPaused()` signal was never reset on source switch.

**Fix**: Reset `playbackPaused` to `false` in `MainWorkspace.tsx` when source changes, mirroring the `onAudioChange` handler pattern.

## Implementation Steps

1. **`audioWaveform.ts`**:
   - Change beat markers to subtle ticks
   - Chunk `computeBeatFrames` with `setTimeout` yielding

2. **`audioAnalysis.ts`**:
   - Chunk pre-computation loop in `createAudioAnalyzer` with `setTimeout` yielding

3. **`AudioReactivePanel.tsx`**:
   - Fix waveform redraw by using reactive canvas ref + `audioSource` dependency
   - Reset beat cache on source switch

4. **`useAudioReactive.ts`**:
   - Call `onPlaybackTime(0)` in file mode cleanup
   - Reset `paused = false` in file mode cleanup

5. **`MainWorkspace.tsx`**:
   - Reset `playbackTime` in `onAudioChange`
   - Reset `playbackPaused` on source change

## Risk Assessment

- Chunking the FFT pre-computation changes a synchronous API to async — callers must be aware
- `createAudioAnalyzer` is already wrapped in `setTimeout` in MainWorkspace, so going async is natural
- Beat computation already runs inside a `setTimeout` (AudioReactivePanel.tsx:414), so making it async is low-risk
- Resetting playback state on source switch is a behavioral change — verify it doesn't break expected "resume where left off" UX
