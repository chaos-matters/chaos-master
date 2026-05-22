# Animation MP4 Video Export

## Context

The app currently exports single PNG frames with metadata. This plan adds full animation export as MP4 video, built on the existing quality-gated rendering pipeline (Tasks 214-215) and following the architecture in `docs/plans/animation-rendering.md`.

**Core constraint**: reuse the main Flam3 canvas (not off-screen), using `exportQuality` and `onExportImage` patterns already established for PNG export.

## Implementation Phases

### Phase 1: Core Encoding Pipeline

**Step 1.1**: Add `"mp4-muxer": "^5.2.1"` to `packages/app/package.json` dependencies and install.

**Step 1.2**: Create `packages/app/src/utils/videoEncoder.ts`

Two code paths — WebCodecs (primary) and MediaRecorder (fallback):

```ts
export type VideoEncoderConfig = {
  codec: 'avc' | 'hevc' | 'vp9'
  width: number
  height: number
  fps: number
  bitrate?: number
}

export function createVideoEncoder(config: VideoEncoderConfig): {
  encodeFrame: (bitmap: ImageBitmap, frameIndex: number) => void
  finalize: () => Promise<{ blob: Blob; mimeType: string; usedFallback: boolean }>
  cancel: () => void
  usedFallback: boolean
}
```

- Feature-detect WebCodecs (`typeof VideoEncoder !== 'undefined'`)
- WebCodecs path: `VideoEncoder` + `Muxer` (mp4-muxer `ArrayBufferTarget`), codec mapping `avc`→`avc`, `hevc`→`hevc`, `vp9`→`vp09`, keyframe every 30th frame
- MediaRecorder fallback: off-screen `<canvas>` + `captureStream(fps)`, pref `video/webm;codecs=vp9`, collect chunks, return Blob
- First call to `encodeFrame` lazily configures the encoder
- `finalize()` flushes encoder, finalizes muxer, returns Blob

### Phase 2: Frame Capture Integration

**Step 2.1**: Add `applyTimelineToFlameAtFrame` to `packages/app/src/utils/timeline.ts`

Extract shared `applyTracksToFlame(tracks, flame, frame)` helper. `applyTimelineToFlame` calls it with `timeline.currentFrame()`, new function calls it with explicit frame number.

```ts
export function applyTimelineToFlameAtFrame(
  timelineState: TimelineState,
  flame: FlameDescriptor,
  frame: number,
): void
```

**Step 2.2**: Add animation export signals to `packages/app/src/flame/renderStats.ts`

```ts
export type AnimationExportProgress = {
  currentFrame: number
  totalFrames: number
  currentPointCount: number
  targetPointsPerFrame: number
  totalFramesComplete: number
  startedAt: number
}
export const [animationExportProgress, setAnimationExportProgress] =
  createSignal<AnimationExportProgress | undefined>(undefined)
export const [animationExportRunning, setAnimationExportRunning] =
  createSignal(false)
```

**Step 2.3**: Gate accumulation resets in `packages/app/src/flame/Flam3.tsx`

Three `resetAccumulation()` calls need guarding with `if (!animationExportRunning())`:
- Camera-reset effect (~line 307): gate only the reset, camera.update() still runs
- Frame-change effect (~line 301): early return when `animationExportRunning()`
- Parameter fingerprint effect (~line 293): gate only the reset

**Step 2.4**: Create `packages/app/src/utils/animationExport.ts` orchestrator

```ts
export type AnimationExportConfig = {
  quality: number; resolution: number; fps: number
  frameStart: number; frameEnd: number; playCount: number
  codec: 'avc' | 'hevc' | 'vp9'; embedMetadata: boolean
}

export function createAnimationExport(
  config: AnimationExportConfig,
  canvas: HTMLCanvasElement,
  baseWidth: number, baseHeight: number,
  timeline: TimelineState,
  baseFlame: FlameDescriptor,
  setExportQuality, setAnimationExportProgress, setAnimationExportRunning,
  onExportImage: { set, get },
): { cancel: () => void; promise: Promise<void> }
```

Per-frame loop:
1. Clone flame → `structuredClone(baseFlame)` → `applyTimelineToFlameAtFrame(timeline, clone, frame)`
2. Set `exportQuality(config.quality)` → Flam3 renders to quality
3. Wait for `accumulatedPointCount >= qualityPointCountLimit()()` via polling in `onExportImage` callback (same pattern as `handleExport`)
4. `createImageBitmap(canvas, { resizeWidth, resizeHeight, resizeQuality: 'high' })` → `encoder.encodeFrame(bitmap, frameIndex)`
5. Update `animationExportProgress`
6. Advance frame, repeat for playCount

Export `cancelAnimationExport` signal — orchestrator sets it, UI/cancel button calls it.

### Phase 3: Tabbed UI in ExportPngDialog

**Step 3.1**: Add Image/Animation tabs to `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx`

- Tab state: `'image' | 'animation'`
- Image tab: existing controls (resolution, quality, exposure, vibrancy, drawMode, bg color, embed checkboxes)
- Animation tab controls:
  - Quality slider (default 0.9)
  - Resolution select (1x/2x/4x, shared with image tab)
  - Frame range inputs (start/end, auto-populated from timeline config)
  - FPS override (default from timeline config, range 12-60)
  - Play count input (1 = once, default: 1)
  - Codec select: H.264/H.265/VP9
  - Embed metadata checkbox (default on)
- Footer: Cancel + Export Image (image tab) / Render Animation (animation tab)
- `handleRenderAnimation()`: reads config from dialog state, calls `startAnimationExport(config)`

**Step 3.2**: Add tab CSS to `ExportPngDialog.module.css`

`.tabBar`, `.tab`, `.tabActive` selectors for the tab switcher.

**Step 3.3**: Update factory signature

Add `startAnimationExport: (config: AnimationExportConfig) => void` parameter.

### Phase 4: ProgressBar Dual-Mode

**Step 4.1**: Modify `packages/app/src/components/ProgressBar/ProgressBar.tsx`

- Import `animationExportProgress`
- `mode` memo: `'image' | 'animation' | 'none'`
- Animation mode display:
  - Label: "Rendering Animation..."
  - Stats: "frame N / M"
  - Secondary: current frame point accumulation
  - Primary bar: frame completion %
  - ETA: from average time per completed frame
- Dismiss click: in image mode clears exportProgress; in animation mode calls cancel callback

### Phase 5: Metadata Embedding + App Wiring

**Step 5.1**: Create `packages/app/src/utils/flameInMp4.ts`

Mirrors `flameInPng.ts` pattern for MP4 container:
```ts
export function createMetadataPayload(flame, tracks, config): Promise<Uint8Array>
// Compresses { flame, animation: { tracks, config } } → Uint8Array
```

Inject as custom `flm3` atom in `udta` box under `moov`. If mp4-muxer doesn't support custom user data boxes directly, post-process the MP4 buffer (insert box before `moov` children end).

**Step 5.2**: Wire in `packages/app/src/App.tsx`

- Import `AnimationExportConfig`, `createAnimationExport`, `animationExportRunning`, canvas info signals
- `startAnimationExport(config)`: creates orchestrator, stores cancel fn, handles completion/error with toast
- Pass `startAnimationExport` to `createExportPngDialog`
- Canvas info: read from `useCanvas()` or pass a callback from Flam3 to capture the canvas element + base dimensions on first render
- Cancel button: ProgressBar calls `cancelAnimationExport()()` in animation mode

## Files Changed

| File | Change |
|------|--------|
| `packages/app/package.json` | Add `mp4-muxer` dependency |
| `packages/app/src/utils/videoEncoder.ts` | **Create** — WebCodecs + MediaRecorder |
| `packages/app/src/utils/timeline.ts` | Add `applyTimelineToFlameAtFrame` + extract helper |
| `packages/app/src/flame/renderStats.ts` | Add `AnimationExportProgress`, signals |
| `packages/app/src/flame/Flam3.tsx` | Gate 3 accumulation resets |
| `packages/app/src/utils/animationExport.ts` | **Create** — per-frame orchestrator |
| `packages/app/src/components/ExportPngDialog/ExportPngDialog.tsx` | Tabs, animation tab controls, factory params |
| `packages/app/src/components/ExportPngDialog/ExportPngDialog.module.css` | Tab styles |
| `packages/app/src/components/ProgressBar/ProgressBar.tsx` | Dual-mode display |
| `packages/app/src/utils/flameInMp4.ts` | **Create** — MP4 metadata embedding |
| `packages/app/src/App.tsx` | Wire animation export, canvas info, cancel |

## Verification

1. `npx tsc --noEmit` in packages/app — passes cleanly
2. Manual test: open dialog, switch to Animation tab, click Render Animation → progress bar shows frame progress → MP4 downloads
3. Manual test: cancel mid-export → state cleanly reset
4. Manual test: non-WebCodecs browser → MediaRecorder fallback produces WebM
5. Format + lint pass, commit and push
