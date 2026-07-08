# Chaos Master — Roadmap

## How chaos-master compares to established fractal tools

### Apophysis / flam3

| Feature | Apophysis | chaos-master |
|---|---|---|
| Named variations (50+) | Yes — sinusodial, spherical, swirl, julian, horseshoe, etc. | No — uses composable "synth" (parametric) variation builder instead |
| Mutation / breeding | Yes — genetic crossover of two flames | Partial — randomizer exists, no breeding |
| Batch rendering | Yes — render .flame files to disk | Partial — offscreen animation export, no batch queue |
| .flame XML import/export | Yes — standard interchange format | No — uses own JSON format |
| Gradient editor | Yes — visual gradient editor | Yes — `ColorMapSelector`, `CustomPaletteEditor` |
| Scripting (Apophysis Script) | Yes — automation language | No |
| Plugin system | Yes — custom variations as plugins | Yes — custom WGSL variation compiler |

**Key gap:** Apophysis's mutation/breeding and .flame format compatibility are its defining community features. chaos-master's synth variation system is more powerful than picking from a fixed list, but the community expects named variations and .flame import.

### Chaotica

| Feature | Chaotica | chaos-master |
|---|---|---|
| Node-based world editor | Yes — visual graph for fractal structures | No — flat transform list |
| HDR / 32-bit float pipeline | Yes — EXR output | No — 8-bit RGBA output |
| Deterministic renderer | Yes — pixel-perfect mode | No — stochastic only |
| Network/distributed rendering | Yes — render farm support | No |
| OpenGL preview | Yes — hardware-accelerated preview | Yes — WebGPU real-time preview |
| Keyframe animation | Yes — any parameter keyframeable | Partial — camera + some render params keyframeable |
| Direct video output | Yes — MP4 from timeline | Yes — WebCodecs MP4 export |
| Motion blur | Yes — temporal anti-aliasing | No |
| Looping / ping-pong modes | Yes | Partial — loop toggle exists, no ping-pong |
| Apophysis .flame import | Yes | No |
| Commercial license | Yes — paid tiers | AGPL-3.0 open source |

**Key gap:** Node-based editing, HDR pipeline, deterministic rendering, motion blur, and .flame import.

### JWildfire

| Feature | JWildfire | chaos-master |
|---|---|---|
| 100+ variations | Yes | No — parametric synth instead |
| Layers and compositing | Yes — multi-layer with blending | No |
| GPU rendering (OpenCL) | Yes | Yes — WebGPU |
| Interactive editor | Yes — real-time preview | Yes |
| Animation/movie rendering | Yes — keyframing + motion blur | Partial — animation export, no motion blur |
| Dancing Flame (audio) | Third-party — via external scripts/tools | No — see "Audio-Reactive Flames" below |
| Sunflow integration (raytracing) | Yes — 3D raytraced renders | No |
| DOF / bokeh effects | Yes | No |

**Key gap:** Layers/compositing, audio reactivity, raytraced 3D renders, DOF.

### IFSRenderer (bezo)

A simpler C++ IFS renderer (Barnsley fern, Sierpinski triangle, etc.). Not flame-specific. chaos-master is already far more capable in the flame domain. Reference for classic IFS education/visualization.

---

## Feature gaps vs established tools (prioritized)

### High priority — differentiate or catch up

1. **.flame XML import/export** — The universal interchange format. Without it, chaos-master is an island. Every other tool speaks .flame. Import lets users bring in 20+ years of community parameters.

2. **Layers and compositing** — JWildfire and Chaotica both support multi-layer rendering with blend modes. This is how professional fractal artists build complex scenes (e.g., a flame background + a sharp foreground element on separate layers).

3. **Motion blur** — Temporal anti-aliasing for animation. Every frame-based animation tool needs this for professional-looking output.

4. **Flame breeding / crossover** — Take two flames, genetically cross their transforms/weights/variations to produce offspring. Apophysis's most beloved creative feature.

5. **Batch rendering** — Queue multiple flames/animations for overnight rendering. Offscreen export jobs exist but only manage one animation at a time.

### Medium priority — quality of life

6. **HDR / 32-bit float export** — EXR or 16-bit PNG output. Current 8-bit output limits post-processing.
7. **Deterministic rendering mode** — For scenes where reproducible pixel-perfect output matters (e.g., A/B comparison, scientific use).
8. **Ping-pong loop mode** — Play forward then backward for seamless loops. Standard in all animation tools.
9. **Dedicated named variations** — Alongside the synth system, offer the classic flam3 variation set (sinusoidal, spherical, swirl, julian, etc.) as one-click presets. Users expect them.
10. **DOF / bokeh** — Depth-of-field post-effect for 3D fly-throughs.

### Lower priority — nice to have

11. **Node-based editor** — Chaotica-style visual graph. Large UI undertaking; synth variation system already covers much of this conceptually.
12. **Sunflow/raytraced 3D** — JWildfire's 3D raytracing integration. Huge scope.
13. **Network rendering** — Render farm support. Requires infrastructure.
14. **Scripting / automation** — Apophysis Script equivalent. Could use JS directly since chaos-master runs in the browser.

---

## New Feature: Audio-Reactive Flames ("Dancing Fractals")

### Concept

User uploads an audio track (MP3/WAV). The waveform and spectral data drive flame parameters in real-time, making the fractal "dance" to the music. Think MilkDrop / Butterchurn but with real IFS flame fractals.

### How it works

```
Audio file → Web Audio API decode → FFT analysis per frame
  → Map frequency bands → flame parameters (intensity, weights, palette phase, camera)
  → Render frame → WebCodecs encode → MP4 output
```

### Parameter mappings (audio → flame)

| Audio feature | Flame parameter | Effect |
|---|---|---|
| Bass amplitude (20-200Hz) | Variation intensity / weight | Pulsing shapes on kick drum |
| Mid amplitude (200-2kHz) | Transform rotation / scale | Melodic movement |
| High amplitude (2k-20kHz) | Palette phase / speed | Sparkle on hi-hats |
| Overall RMS energy | Exposure / vibrancy | Brightness pulses |
| Spectral centroid | Camera zoom | Zoom in on brighter sections |
| Beat detection (onset) | Skip iterations / palette reset | Sharp transitions on beat |
| Spectral flatness | Variation blend weight | Noise ↔ structured shapes |
| RMS per frequency band | Individual transform weights | Different transforms for different instruments |

### UI flow

1. User opens "Audio Reactive" panel
2. Drops/selects an audio file
3. Waveform preview renders with beat markers
4. User assigns parameter mappings (presets available: "Pulse", "Groove", "Ambient", "Chaos")
5. Preview: real-time flame dances to audio in viewport
6. Export: renders full animation synced to audio as MP4 with audio track

### Technical notes

- Web Audio API `AnalyserNode` gives us FFT data in real-time
- Offline export uses `OfflineAudioContext` for precise frame-accurate analysis
- Beat detection via onset detection algorithms on the FFT data
- Could be a premium feature gated behind subscription

---

## New Feature: Fractal Sonification ("Hear the Fractals")

### Concept

As the user flies through 3D fractal space, points and structures emit sound based on their mathematical properties — density, iteration depth, color intensity. A completely novel way to experience fractals. Nothing like this exists in any fractal tool.

### How it works

```
Render pass → sample N points in viewport → for each point:
  → Iteration count → pitch (more iterations = higher pitch)
  → Density → volume (denser = louder)
  → Color/heat → timbre (warm colors = warm tones, cool = metallic)
  → Spatial position → stereo panning (left/right) + reverb (depth)
→ Web Audio API → spatial audio output
```

### Mapping models

**Model A: "Orchestral"** — Points become notes in a scale
- Iteration count mapped to a pentatonic/modal scale
- Higher density → more simultaneous voices (chords)
- Camera movement → the "orchestra" shifts as you fly through

**Model B: "Ambient Drone"** — Continuous ambient soundscape
- Overall fractal complexity → harmonic density
- Palette colors → filter frequencies (warm = low-pass, cool = high-pass)
- Zoom level → reverb wet/dry mix
- Flying through dense regions → crescendo

**Model C: "Percussive"** — Each transform becomes a percussive voice
- Transform 1 = kick, Transform 2 = snare, Transform 3 = hi-hat, etc.
- Weights determine probability of each voice firing per sample
- Camera movement through high-weight regions triggers more events

### UI flow

1. User opens "Sonification" panel
2. Selects mapping model (Orchestral / Ambient / Percussive)
3. Adjusts sensitivity, scale, tempo, spatial spread
4. Clicks "Enable Audio" — sound begins in real-time as they navigate
5. Optional: record audio output as WAV alongside screen recording

### Technical notes

- Real-time: Web Audio API `OscillatorNode` / `AudioBufferSourceNode` per voice
- Musical scales: pre-computed frequency tables for pentatonic, chromatic, modal
- Spatial audio: `PannerNode` for stereo positioning, `ConvolverNode` for reverb
- Performance: sample ~200-500 points per audio frame (not full render), amortized
- Could record to `OfflineAudioContext` for high-quality WAV export

---

## Timeline feature plan — remaining gaps

From the existing `TIMELINE_FEATURE_PLAN.md`, these items are still open:

**Phase 1 (in progress):**
- All 26 variation parameters keyframeable
- Variation weights/ratios keyframeable
- Animation presets save/load
- Keyframe interpolation modes (bezier/ease/bounce/elastic)
- Keyframe duplication, freeze, mirror
- Bezier control points with visual feedback

**Phase 2 (playback):**
- Skip to next/previous keyframe
- Go-to-frame input
- Play speed control
- Scrubbing
- Frame counter + time display

**Phase 3 (UI):**
- Track grouping (camera / render / variations)
- Drag-and-drop track reordering
- Keyboard shortcuts for timeline

---

## Suggested implementation order

### Next up (this cycle)

1. **Audio-Reactive Flames** — New, differentiating, no other fractal tool has it built-in. High wow-factor.
2. **Flame breeding / crossover** — Apophysis's killer feature. Makes the randomizer 10x more creative.
3. **.flame XML import** — Opens up 20 years of community content.

### Later

4. **Fractal Sonification** — Experimental, artistic. Best after audio infrastructure from #1 is in place.
5. **Layers + compositing** — Professional workflow. Substantial architecture change.
6. **Motion blur** — Required for polished animation output.
7. **HDR export pipeline** — For professional post-production.

### Eventually

8. Named variations as presets
9. Batch render queue
10. Ping-pong loop mode
11. DOF / bokeh
12. Node-based editor (stretch goal)

---

## Notes

- chaos-master's synth variation system is genuinely innovative — no other tool lets users compose variations from parametric building blocks. This should remain the primary UX.
- WebGPU is a competitive advantage: real-time GPU preview with no install. Lean into this.
- The browser platform enables features desktop tools can't: instant sharing via URLs, no-install access, Discord/OG integration. Already well-executed.
- Audio features (#1 and #2 above) leverage the browser's Web Audio API — another advantage desktop tools don't have natively.
