# Animation Rendering Plan

Export timeline animations as MP4 video with metadata embedding, progress tracking, and tabbed UI in the render modal.

## Overview

Currently the app can export single PNG frames with metadata embedding. This plan extends the render system to export full animations as video files. The key challenges are:

1. **Frame sequencing** — iterating over the animation frame range, applying keyframe values to the flame descriptor for each frame
2. **Per-frame quality rendering** — each frame must accumulate enough IFS points before capture
3. **Video encoding** — assembling captured frames into a video container with audio-less tracks
4. **Metadata embedding** — storing flame descriptor + timeline tracks inside the video file so animations can be round-tripped
5. **UI** — tabbed modal layout separating image from animation export controls

## Technical Approach: WebCodecs + mp4-muxer

### Why WebCodecs (not MediaRecorder)

| Concern | MediaRecorder | WebCodecs |
|---------|--------------|-----------|
| Codec control | Browser-chosen, no config | H.264/H.265/AV1 explicit |
| Quality control | Bitrate only | CRF, bitrate, profile, level |
| Frame timing | Real-time capture only | Arbitrary frame pacing |
| Metadata embedding | None | Custom boxes via mp4-muxer |
| Browser support | All browsers | Chrome, Edge, Opera (covers 75%+ users) |
| Fallback | — | MediaRecorder as graceful degradation |

**Choice**: WebCodecs with `mp4-muxer` (https://github.com/Vanilagy/mp4-muxer) as primary path. MediaRecorder fallback for browsers without WebCodecs.

### Dependencies to add

```
"mp4-muxer": "^5.x"        # MP4 container muxing (~15KB)
```

No other new dependencies. WebCodecs is a browser API (no polyfill needed).

## Architecture

```
┌──────────────────────────────────────────────────┐
│  ExportPngDialog (tabbed UI)                      │
│  ┌─────────────┬──────────────────────────────┐  │
│  │ Tab: Image   │ Tab: Animation               │  │
│  │ (existing)   │ quality, fps, frame range,   │  │
│  │              │ resolution, embed metadata   │  │
│  └─────────────┴──────────────────────────────┘  │
│  ┌─────────────────────────────────────────────┐ │
│  │ Live Preview (shared)                       │ │
│  └─────────────────────────────────────────────┘ │
│  [Cancel] [Export Image] [Render Animation]       │
└──────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│  createAnimationExport()  (new file)              │
│                                                    │
│  1. Receive config: quality, resolution, fps,     │
│     frameStart, frameEnd, flameDescriptor,        │
│     timeline tracks                                │
│                                                    │
│  2. For each frame:                               │
│     a. Build frame-specific FlameDescriptor       │
│        (applyTimelineToFlame for this frame)       │
│     b. Override main Flam3 quality prop           │
│        (same pattern as image exportQuality)       │
│     c. Wait for accumulatedPointCount ≥ limit     │
│     d. Capture canvas → VideoFrame                │
│     e. Update ExportProgress (frame N/total)      │
│                                                    │
│  3. Finalize MP4 → download                        │
└──────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────┐
│  VideoEncoder + Muxer (WebCodecs pipeline)        │
│                                                    │
│  canvas → ImageBitmap → VideoFrame                │
│           → VideoEncoder.encode()                 │
│               → EncodedVideoChunk                 │
│                   → muxer.addVideoChunk()         │
│                       → mp4-muxer                 │
│                           → MP4 Blob              │
└──────────────────────────────────────────────────┘
```

## Frame Rendering Strategy

### Option A: Off-screen separate Flam3 per frame (preferred)

Create a hidden off-screen `<canvas>` with its own Flam3 instance. For each frame:
1. Build the frame-specific flame descriptor
2. Set it as the Flam3's descriptor prop
3. Render until quality limit reached (monitoring accumulatedPointCount)
4. Capture the off-screen canvas
5. Advance to next frame

**Pro**: Main canvas unaffected during export. Can show progress bar. Existing Flam3 handles reset-on-descriptor-change automatically.
**Con**: Requires a second WebGPU context/adapter (GPU memory overhead).

### Option B: Reuse main canvas (current image export pattern)

Override the main Flam3 like image export does with `exportQuality`. For each frame:
1. Pause the animation playback timeline
2. Set `flameDescriptor` to the frame-specific descriptor
3. Let Flam3 render to quality
4. Capture canvas
5. Advance frame, repeat

**Pro**: Simpler, follows existing pattern. No extra GPU context.
**Con**: User sees the render happening frame-by-frame on the main canvas (could be jarring). Main UI is blocked.

### Decision: Option A (off-screen) for polish, Option B for initial implementation

Start with Option B to validate the pipeline quickly. The progress bar overlay already covers the main canvas during export. Add Option A as a follow-up if users report the frame-by-frame visual is distracting.

## Tabbed UI Design

### Image tab (existing, minor additions)
- Resolution (1x/2x/4x)
- Quality presets + slider
- Exposure slider
- Vibrancy slider
- Draw mode select
- Background color picker
- Embed flame checkbox
- Embed animation checkbox
- **Export** button → triggers current `handleExport()`

### Animation tab (new)
- **Quality** — same slider/range as image tab (0.5–0.999). Default 0.9 for animations (faster than 0.99 for stills since each frame compounds the cost)
- **Resolution** — 1x/2x/4x select. Default 1x.
- **Frame range** — start/end frame inputs, auto-populated from timeline config. "Use timeline range" checkbox.
- **FPS override** — optional, defaults to timeline FPS. Range 12–60.
- **Play count** — 1 = play once, 2 = loop twice, Infinity = loop (default: 1). When >1, renders the frame range N times back-to-back.
- **Codec** — "H.264 (recommended)" / "H.265 (smaller, less compatible)" / "VP9 (Chrome only)"
- **Embed metadata** — checkbox, default on. Embeds flame descriptor + timeline tracks as a custom MP4 box (`flm3` atom under `udta`).
- **Render Animation** button → closes dialog, starts animation export with progress bar.

### Footer buttons
- **Cancel** — closes dialog
- **Export Image** — current image export (visible on both tabs)
- **Render Animation** — animation export (visible on animation tab only)
- Double-click preview → quick animation export (like current quick export but for last frame)

## Progress Tracking

Reuse the existing `ProgressBar` component with animation-specific display:

```
Rendering Animation...   (frame 45 / 90)
████████████░░░░░░░░░░   50%
2m 15s remaining
```

### New signals needed

```ts
// In renderStats.ts
export type AnimationExportProgress = {
  currentFrame: number
  totalFrames: number
  currentPointCount: number   // points in current frame
  targetPointsPerFrame: number // quality limit for this frame
  totalFramesComplete: number  // cumulative completed frames
  startedAt: number            // performance.now() when started
}
export const [animationExportProgress, setAnimationExportProgress] = 
  createSignal<AnimationExportProgress | undefined>(undefined)
```

### ProgressBar changes

Add animation mode detection: when `animationExportProgress` is set, show frame progress instead of point progress. Use a two-level bar:
- Primary bar: frame completion (frames done / total frames)
- Secondary smaller bar or text: current frame's point accumulation

## Metadata Embedding

### MP4 custom atom: `flm3`

Embed the flame data in the MP4's `udta` (user data) box using a custom atom type `flm3`:

```
moov
  udta
    flm3 (custom)
      raw = compressJsonQueryParam({ flame, animation: { tracks, config } })
      → stored as raw bytes in the atom
```

### mp4-muxer integration

```ts
import { Muxer, ArrayBufferTarget } from 'mp4-muxer'

const muxer = new Muxer({
  target: new ArrayBufferTarget(),
  video: { codec: 'avc', width, height },
  // Custom user data box
  fastStart: 'in-memory',
})

// After all frames are written, add metadata
muxer.addChunk(encodedChunk, metadata)
// Finalize
muxer.finalize()
const buffer = muxer.target.buffer
```

### Loading from video

Add a "Load from Video" option (future task, not in scope of this plan):
- Parse the `flm3` atom from the MP4
- Decompress the JSON payload
- Load flame + animation into the app

## File Structure

### New file: `packages/app/src/utils/videoEncoder.ts`

```ts
// Creates a VideoEncoder + Muxer pipeline
// Exports:
// - createVideoEncoder(config, onComplete)
// - encodeFrame(canvas, frameIndex)
// - finalize()
```

### Modified: `packages/app/src/flame/renderStats.ts`

Add animation export progress signals.

### Modified: `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx`

- Add tab state (`'image' | 'animation'`)
- Add animation tab controls
- Add `handleAnimationExport()` function
- Wire animation export progress to ProgressBar

### Modified: `packages/app/src/components/ProgressBar/ProgressBar.tsx`

Support dual progress display (image point accumulation vs animation frame progress).

### Modified: `packages/app/src/App.tsx`

- Render animation progress bar variant
- Import and handle animation export state reset

## Implementation Phases

### Phase 1: Core encoding pipeline (no UI)

1. Add `mp4-muxer` dependency
2. Create `src/utils/videoEncoder.ts` with WebCodecs VideoEncoder + Muxer
3. Create a minimal test: encode 10 frames of solid colors → download as MP4
4. Verify playback in browser/VLC

### Phase 2: Frame capture integration

1. Build the per-frame render loop using the main Flam3 (Option B)
2. Capture canvas after each frame's quality limit is reached
3. Feed frames to encoder
4. Implement fallback to MediaRecorder for non-WebCodecs browsers

### Phase 3: Tabbed UI

1. Add tab switcher to ExportPngDialog
2. Build animation tab controls
3. Wire "Render Animation" button to the export pipeline
4. Update ProgressBar for animation mode

### Phase 4: Metadata embedding

1. Implement `flm3` custom atom via mp4-muxer
2. Add "Embed metadata" checkbox to animation tab
3. Test round-trip: export animation as MP4 → parse metadata → load flame

### Phase 5: Polish

1. Off-screen rendering (Option A) if needed
2. Performance optimization (reuse VideoFrame buffers, parallel encode + render)
3. Graceful degradation: detect WebCodecs support, fall back to MediaRecorder
4. Codec auto-detection (H.264 support, fallback to VP9 or VP8)

## Technical Risks

| Risk | Mitigation |
|------|-----------|
| WebCodecs not available in Firefox/Safari | Feature detect; fallback to MediaRecorder with lower quality |
| GPU memory pressure from second Flam3 context | Start with reusable main-canvas approach (Option B) |
| Large MP4 files for long animations | CRF/bitrate control; user-configurable quality per frame |
| Browser tab throttling during background export | Keep tab focused; warn user if tab loses focus |
| mp4-muxer buffer growth for long animations | Stream to file via File System Access API for >1000 frames |

## Browser Compatibility

| Browser | WebCodecs | MediaRecorder | Notes |
|---------|-----------|---------------|-------|
| Chrome 94+ | Yes | Yes | Primary target |
| Edge 94+ | Yes | Yes | Same as Chrome (Chromium) |
| Opera 80+ | Yes | Yes | Same as Chrome |
| Firefox | No | Yes (VP8/VP9 only) | MediaRecorder fallback |
| Safari 16.4+ | No | Yes (H.264) | MediaRecorder fallback |
| Mobile Chrome | Yes | Yes | Works on Android |
| Mobile Safari | No | Yes (H.264) | Works on iOS |

~75-80% of users get WebCodecs path; remainder get MediaRecorder fallback.

## File Size Estimates

| Animation | Frames | Resolution | Quality | Est. Size (H.264) |
|-----------|--------|------------|---------|-------------------|
| 3 sec, 30fps | 90 | 1x (800px) | 0.9 | ~2-4 MB |
| 3 sec, 30fps | 90 | 2x (1600px) | 0.9 | ~8-15 MB |
| 10 sec, 30fps | 300 | 1x | 0.9 | ~6-12 MB |
| 10 sec, 30fps | 300 | 2x | 0.95 | ~20-40 MB |

CRF target: 23 (good quality) for H.264. Metadata payload: ~5-20KB per file.
