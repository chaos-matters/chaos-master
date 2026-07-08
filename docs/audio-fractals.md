# Audio Fractals — Feature Brainstorm

Ideas beyond the current audio-reactive implementation. Grouped by effort category.

## Quick Wins (hours, not days)

### 1. Live Microphone Input

Replace the file-based analyzer with real-time mic capture via
`navigator.mediaDevices.getUserMedia()` → `AnalyserNode`. FFT bins from the
AnalyserNode feed the same `getFftBands()` function, producing `FrameData`
compatible with the existing `applyAudioMappingsToFlame()`.

**UX**: Toggle between "File" and "Mic" source in AudioReactivePanel. Mic mode
shows a live waveform and a level meter. No file upload needed — the fractal
dances to ambient sound, voice, or any system audio routed through the mic.

**Integration**: The live analyzer produces `FrameData` at the existing 30fps
update rate. The same `createEffect` in MainWorkspace that reads
`audioEnabled()` picks up mic frames instead of file frames.

### 2. Frequency-Band Color Temperature

Map dominant frequency bands to color palette phase shifts. Low frequencies
(bass) warm the palette toward red/orange; high frequencies (brilliance) cool
it toward blue/violet.

**Implementation**: Use spectral centroid to drive `palettePhase`. A low
centroid (bass-heavy) shifts phase toward warm hues; a high centroid
(brightness-heavy) shifts toward cool hues. The existing `AudioMappingEntry`
already handles `palettePhase` — this is just a preset.

### 3. Onset Transient Effects

Sharp audio transients (drum hits, plosives) trigger short-lived visual
effects: a brief highlight-power spike, a 1-frame vibrancy burst, or a
momentary contrast punch. Different from beat detection — onsets are attack
transients regardless of rhythmic position.

**Implementation**: Compute onset strength from the frame-to-frame delta of
RMS × centroid. When onset strength exceeds a rolling-median threshold, apply
a 50-100ms exponential decay envelope to `highlightPower` or `vibrancy`.

## Medium Complexity (1-3 days each)

### 4. Stereo Field → Spatial Offset

Map stereo information to fractal spatial parameters. Left-channel energy
shifts the flame position leftward; right-channel energy shifts it rightward.
Phase correlation between channels drives `spatialSpread` in the sonification
engine.

**Implementation**: Run a stereo AnalyserNode (2 channels). Compute L/R RMS
ratio to modulate camera `position.x`, and mid/side ratio to modulate
`theta`/`phi` in 3D. Works for both file-based (stereo AudioBuffer) and live
mic (stereo MediaStream).

### 5. Spatial Audio / 3D Sonification

Use the Web Audio API's `PannerNode` with HRTF to position sonification voices
in 3D space around the listener. Each transform variation maps to a spatial
position; dense transforms create a "cloud" of sound surrounding the listener.

**Implementation**: Replace `StereoPannerNode` with `PannerNode` set to
`'HRTF'` model. Map transform color.x/y to azimuth/elevation, and transform
weight to distance. Requires spatial audio output (headphones recommended).

### 6. Granular Scrubbing Through Audio

Instead of playing audio linearly, allow the user to scrub through the audio
file by dragging on the waveform. The flame interpolates to the audio state at
that time position. Useful for finding good visual moments and for
performative playback.

**Implementation**: Add a scrub handle to the existing waveform canvas in
AudioReactivePanel. Dragging sets a `seekPosition` signal that overrides the
normal playback position. The analyzer's `getFrameData()` accepts an optional
frame override.

### 7. Scale Detection from Flame Palette

Analyze the flame's color palette and automatically select a musical scale
that harmonizes with the dominant colors. Warm palettes (red/orange) map to
major keys; cool palettes (blue/violet) map to minor keys. Saturated palettes
use wider intervals (chromatic); muted palettes use narrower intervals
(pentatonic).

**Implementation**: Sample the palette at fixed intervals, convert to OkLab,
compute mean hue angle. Hue < 90° or > 270° → pentatonic major, 90°-210° →
pentatonic minor, 210°-270° → chromatic. Selected scale feeds into
`SonificationEngine.setConfig({ scale })`.

### 8. MIDI Output

Emit MIDI notes from transform properties so external synthesizers or DAWs
can play the fractal. Each transform becomes a MIDI voice; variation count
maps to instrument/channel; weight maps to velocity.

**Implementation**: Use the Web MIDI API (`navigator.requestMIDIAccess()`).
Map transforms to MIDI note-on/note-off events at the sonification update
rate. Weight → velocity (0-127), color.x → note number within the selected
scale, color.y → pitch bend or CC value.

## Ambitious (days to weeks)

### 9. Audio-Reactive ↔ Sonification Cross-Feed

Create a feedback loop: audio drives flame parameters (existing), flame
parameters drive sonification, and the sonification output feeds back into the
audio analysis pipeline — making the fractal both listener and performer.

**Implementation**: Route sonification output (via `MediaStreamDestination`)
into a second AnalyserNode. Weight the cross-feed gain with a configurable
"feedback" slider. At 0%, sonification is purely flame-driven; at 100%, the
fractal is effectively playing itself with only the seed audio as a nudge.

### 10. Export with Sonification Mix

Current export adds the source audio track to the MP4. This feature would also
mix in the real-time sonification output, so the exported video contains both
the original audio and the synthesized "fractal voice" layered together.

**Implementation**: Route sonification engine through an
`OfflineAudioContext` during export, render the sonification output as an
`AudioBuffer`, and mix it with the source audio buffer before passing to the
muxer. A "Sonification Mix" slider in export settings controls the wet/dry
ratio.

### 11. Bidirectional Mapping (Flame → Audio + Audio → Flame)

The current system maps audio features → flame parameters (one direction).
Bidirectional mapping would also allow flame parameter changes (e.g., user
drag on a spline curve, or timeline morph) to synthesize sound, making the
fractal a visual instrument.

**Implementation**: Invert the mapping functions. When a flame parameter
changes (detected via `createEffect` watching `flameDescriptor`), synthesize a
corresponding audio event: parameter delta magnitude → gain, parameter type →
oscillator waveform, parameter target value → frequency. The synthesis plays
through a dedicated `GainNode` mixed into the audio output.

## Implementation Priority

1. **Live Microphone Input** — highest impact, lowest effort
2. **Onset Transient Effects** — dramatic visual impact for minimal code
3. **Frequency-Band Color Temperature** — makes existing features richer
4. **Stereo Field → Spatial Offset** — unique differentiator
5. **Granular Scrubbing** — UX polish for the waveform panel
6. **Scale Detection from Palette** — tightens audio-visual coherence
7. **Spatial Audio / 3D Sonification** — immersive but niche
8. **MIDI Output** — appeals to musician users
9. **Cross-Feed** — complex but conceptually beautiful
10. **Export with Sonification Mix** — production value
11. **Bidirectional Mapping** — experimental, potentially a separate project
