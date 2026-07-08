# Plan: Audio-Reactive Flames ("Dancing Fractals")

## Context

Repo: `/chaos-master-fp-audit` | Branch: `feat/audio-fractals`

Audio-reactive flames drive flame renderSettings parameters from FFT audio
analysis, making fractals "dance" to music in real-time. Export produces MP4
with synced audio track.

## Architecture (actual codebase)

```
MainWorkspace.tsx — flame descriptor store + all UI
  Flam3.tsx — GPU renderer, reads animatedFlame() signal, writes colorGradingUniforms
    renderSettings (audio-drivable): vibrancy, exposure, palettePhase, paletteSpeed,
      contrast, gamma, highlightPower, lightPower, depthColorPower, skipIters
    camera: zoom, position, rotation (3D theta/phi/radius)
  animationExport.ts — per-frame export loop: clone flame → apply timeline →
    set descriptor → wait quality limit → capture canvas → encode
  videoEncoder.ts — WebCodecs VideoEncoder + mp4-muxer Muxer (video-only today)
  ViewControls.tsx — toolbar with Blend, Morph buttons; needs Audio button
```

## Files to Create

### 1. `packages/app/src/utils/audioAnalysis.ts`

Pure audio analysis — no SolidJS dependencies.

```ts
// Decode uploaded audio file
decodeAudioFile(file: File): Promise<AudioBuffer>

// Per-frame FFT analyzer (uses OfflineAudioContext for export, AnalyserNode for live)
createAudioAnalyzer(audioBuffer, targetFps): AudioAnalyzer

// Beat detection via spectral flux
detectBeats(fftFrames: FrameData[]): Set<number>

type FrameData = {
  bands: number[]      // 8 bands: sub-bass, bass, low-mid, mid, hi-mid, presence, brilliance, full
  rms: number
  centroid: number
  flatness: number
}

type AudioAnalyzer = {
  getFrameData(frameIndex: number): FrameData & { isBeat: boolean }
  totalFrames: number
  duration: number
}
```

### 2. `packages/app/src/utils/audioExport.ts`

Extends videoEncoder to add audio track.

```ts
// Wraps createVideoEncoder + AudioEncoder, returns combined result with audio track
createAudioVideoEncoder(
  videoConfig: VideoEncoderConfig,
  audioBuffer: AudioBuffer,
  fps: number
): Promise<{
  encodeFrame: (bitmap: ImageBitmap, frameIndex: number) => Promise<void>
  finalize: () => Promise<EncodeResult>
  cancel: () => void
  // ... same API as videoEncoder but muxer gets audio config + chunks
}>
```

Key: `Muxer` from mp4-muxer accepts an audio codec config. AudioEncoder encodes
PCM → AAC/MP4A chunks. Must interleave audio chunks with video frames in finalize().

### 3. `packages/app/src/components/AudioReactivePanel/AudioReactivePanel.tsx`

Factory pattern matching `BlendFlameGallery`:
```ts
createAudioReactivePanel(config): {
  show: () => void
  open: () => void
  isOpen: Accessor<boolean>
  audioBuffer: Accessor<AudioBuffer | undefined>
  audioMapping: Accessor<AudioMapping>
}
```

Contains:
- File drop zone (.mp3/.wav/.ogg/.flac)
- Waveform viz `<canvas>` with beat markers
- Mapping preset selector: "Pulse", "Groove", "Ambient", "Chaos", "Custom"
- Per-param dropdown: audio feature → flame param
- Sensitivity sliders per mapping
- "Enable Live Preview" toggle → sets `audioEnabled` signal

### 4. `packages/app/src/components/AudioReactivePanel/AudioReactivePanel.module.css`

## Files to Modify

### 5. `MainWorkspace.tsx`

- Import `createAudioReactivePanel`
- Create instance in component body
- Add signals: `audioBuffer`, `audioEnabled`, `audioMapping`
- In Flam3's animation/effect loop: when `audioEnabled()` is true, read
  `analyzer.getFrameData(currentFrame)` and apply mapped params via
  `setFlameDescriptor` (matching the existing draft mutation pattern)
- Wire "Audio..." button into ViewControls props

### 6. `ViewControls.tsx`

- Add `onAudioReactive?: () => void` prop
- Add "Audio..." button (next to Blend/Morph)

### 7. `animationExport.ts`

- Add optional `audioBuffer: AudioBuffer` to `AnimationExportConfig`
- When audio present: create analyzer, use `createAudioVideoEncoder` instead of
  `createVideoEncoder`
- Feed per-frame audio analysis data via the existing `setOnExportImage` callback
- Output: MP4 with synced audio track

### 8. `videoEncoder.ts`

- Export `createAudioVideoEncoder` (or export helpers so audioExport.ts can build it)
- Add `AudioEncoder` initialization
- Add audio codec config to Muxer constructor
- Add `encodeAudioChunk` method
- Interleave audio chunks in finalize

## Parameter Mapping Presets

| Preset | Audio → Flame mapping |
|--------|----------------------|
| **Pulse** | Bass → vibrancy (0.3–1.5x), kick beats → palettePhase jolt |
| **Groove** | Mid → camera.zoom (±15%), bass → vibrancy, centroid → palettePhase |
| **Ambient** | RMS → exposure (0.8–1.2x), hi-mid → paletteSpeed, centroid → gamma |
| **Chaos** | Flatness → contrast, all bands → randomize skipIters, beats → highlightPower spike |

## Real-Time Preview Loop

```
Flam3 renderEffect already re-reads animatedFlame() on each tick.
Hook: MainWorkspace creates a createEffect that reads audioEnabled() + currentFrame,
calls analyzer.getFrameData(frameIndex), and mutates flameDescriptor renderSettings
via setFlameDescriptor draft. Flam3 picks up the change on next tick naturally.
```

## Verification

1. `pnpm check` passes (typecheck + lint + fmt)
2. Drop MP3 on Audio Reactive panel → waveform renders with beat markers
3. Select "Pulse" preset, enable preview → flame pulses with bass
4. Play audio in real-time → fractal dances to music
5. Animation export → MP4 downloads with synced audio track
6. No regressions: Blend/Morph still works, normal export still works
