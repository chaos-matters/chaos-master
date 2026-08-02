import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// --- Musical scales ---

const PENTATONIC_MAJOR = [
  261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0,
  1046.5, 1174.66,
]

const PENTATONIC_MINOR = [
  277.18, 311.13, 369.99, 415.3, 466.16, 554.37, 622.25, 739.99, 830.61, 932.33,
  1108.73, 1244.51,
]

const CHROMATIC = [
  261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.0, 415.3, 440.0,
  466.16, 493.88, 523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99,
  783.99, 830.61, 880.0, 932.33, 987.77,
]

// --- Types ---

export type SonificationModel = 'orchestral' | 'ambient' | 'percussive'

export type SonificationConfig = {
  model: SonificationModel
  /** Overall volume 0-1 */
  volume: number
  /** Update rate in Hz (how often flame data is sampled) */
  updateRate: number
  /** Musical scale to map pitches to */
  scale: 'pentatonicMajor' | 'pentatonicMinor' | 'chromatic'
  /** Orchestral: max simultaneous voices */
  voiceCount: number
  /** Ambient: harmonic density multiplier */
  harmonicDensity: number
  /** Percussive: triggers per second per active transform */
  triggerRate: number
  /** Spatial spread 0-1 (stereo width) */
  spatialSpread: number
  /** Reverb mix 0-1 */
  reverbMix: number
}

const DEFAULT_CONFIG: SonificationConfig = {
  model: 'orchestral',
  volume: 0.3,
  updateRate: 20,
  scale: 'pentatonicMajor',
  voiceCount: 8,
  harmonicDensity: 1,
  triggerRate: 4,
  spatialSpread: 0.6,
  reverbMix: 0.3,
}

function getScale(config: SonificationConfig): number[] {
  switch (config.scale) {
    case 'pentatonicMinor':
      return PENTATONIC_MINOR
    case 'chromatic':
      return CHROMATIC
    default:
      return PENTATONIC_MAJOR
  }
}

// --- Voice pool for Orchestral model ---

type Voice = {
  osc: OscillatorNode
  gain: GainNode
  panner: StereoPannerNode
  filter: BiquadFilterNode
  active: boolean
  noteIndex: number
}

function createVoice(ctx: AudioContext, destination: AudioNode): Voice {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const panner = ctx.createStereoPanner()
  const filter = ctx.createBiquadFilter()

  osc.type = 'sine'
  osc.frequency.value = 440
  gain.gain.value = 0
  panner.pan.value = 0
  filter.type = 'lowpass'
  filter.frequency.value = 2000
  filter.Q.value = 1

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(panner)
  panner.connect(destination)
  osc.start()

  return { osc, gain, panner, filter, active: false, noteIndex: 0 }
}

function releaseVoice(voice: Voice, _ctx: AudioContext): void {
  voice.gain.gain.linearRampToValueAtTime(0, _ctx.currentTime + 0.15)
  voice.active = false
  // Oscillator runs at gain 0 — negligible CPU. Stopping would be terminal
  // and prevent re-trigger. The engine disposes all voices on cleanup.
}

function triggerVoice(
  voice: Voice,
  ctx: AudioContext,
  freq: number,
  velocity: number,
  pan: number,
  waveform: OscillatorType,
): void {
  voice.osc.type = waveform
  voice.osc.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.02)
  voice.gain.gain.cancelScheduledValues(ctx.currentTime)
  voice.gain.gain.setValueAtTime(voice.gain.gain.value || 0, ctx.currentTime)
  voice.gain.gain.linearRampToValueAtTime(
    velocity * 0.3,
    ctx.currentTime + 0.02,
  )
  voice.panner.pan.linearRampToValueAtTime(pan, ctx.currentTime + 0.02)
  voice.active = true
}

// --- Orchestral model ---

function createOrchestralEngine(ctx: AudioContext, config: SonificationConfig) {
  const masterGain = ctx.createGain()
  masterGain.gain.value = config.volume
  masterGain.connect(ctx.destination)

  const reverb = createReverb(ctx)
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = 1 - config.reverbMix
  wetGain.gain.value = config.reverbMix
  masterGain.connect(dryGain)
  dryGain.connect(ctx.destination)
  masterGain.connect(reverb.input)
  reverb.output.connect(wetGain)
  wetGain.connect(ctx.destination)

  const voices: Voice[] = []
  for (let i = 0; i < config.voiceCount; i++) {
    voices.push(createVoice(ctx, masterGain))
  }

  let voiceIndex = 0

  const waveforms: OscillatorType[] = ['sine', 'triangle', 'sawtooth', 'square']

  function update(flame: FlameDescriptor): void {
    const transforms = Object.entries(flame.transforms).filter(
      ([, t]) => t.visible,
    )
    if (transforms.length === 0) return

    const scale = getScale(config)

    // Release voices for transforms that dropped below threshold
    for (const voice of voices) {
      if (!voice.active) continue
      // Random decay — some voices naturally fade
      if (Math.random() < 0.3) {
        releaseVoice(voice, ctx)
      }
    }

    // Trigger new notes based on transform properties
    for (const [, t] of transforms) {
      const probability = t.probability ?? 1 / transforms.length
      // Higher weight transforms trigger more often
      if (Math.random() > probability * 1.5) continue

      // Find a free or stealable voice
      const freeVoice = voices.find(
        (v) => !v.active || v.gain.gain.value < 0.01,
      )
      const voice = freeVoice ?? voices[voiceIndex % voices.length]!
      if (!freeVoice) voiceIndex++

      // Map color.x (OkLab a, roughly green-red axis, -0.4 to 0.4) to scale degree
      const colorNorm = (t.color.x + 0.4) / 0.8 // normalize to 0-1
      const noteIndex = Math.floor(colorNorm * (scale.length - 1))
      const freq = scale[clamp(noteIndex, 0, scale.length - 1)]!

      // Map color.y (OkLab b, blue-yellow axis) to pan
      const pan = clamp(t.color.y * config.spatialSpread * 2, -1, 1)

      // Weight → velocity
      const velocity = clamp(probability * 2, 0.1, 1)

      // Variation count → waveform
      const varCount = Object.keys(t.variations).length
      const waveform = waveforms[Math.min(varCount - 1, waveforms.length - 1)]!

      voice.noteIndex = noteIndex
      triggerVoice(voice, ctx, freq, velocity, pan, waveform)
    }

    // Update spatial spread for panners not currently triggering
    for (const voice of voices) {
      if (voice.active) {
        // Slight random drift in pan position for active sustained notes
        const drift =
          voice.panner.pan.value +
          (Math.random() - 0.5) * 0.05 * config.spatialSpread
        voice.panner.pan.linearRampToValueAtTime(
          clamp(drift, -1, 1),
          ctx.currentTime + 0.1,
        )
      }
    }
  }

  function setVolume(v: number): void {
    masterGain.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05)
  }

  function setReverbMix(mix: number): void {
    dryGain.gain.linearRampToValueAtTime(1 - mix, ctx.currentTime + 0.05)
    wetGain.gain.linearRampToValueAtTime(mix, ctx.currentTime + 0.05)
  }

  function dispose(): void {
    for (const voice of voices) {
      try {
        voice.osc.stop()
      } catch {
        /* already stopped */
      }
      voice.osc.disconnect()
      voice.gain.disconnect()
      voice.panner.disconnect()
      voice.filter.disconnect()
    }
    masterGain.disconnect()
    dryGain.disconnect()
    wetGain.disconnect()
    reverb.input.disconnect()
    reverb.output.disconnect()
  }

  return { update, setVolume, setReverbMix, dispose }
}

// --- Ambient Drone model ---

type DroneOsc = {
  osc: OscillatorNode
  gain: GainNode
  lfo: OscillatorNode
  lfoGain: GainNode
}

function createDroneVoice(ctx: AudioContext, destination: AudioNode): DroneOsc {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const lfo = ctx.createOscillator()
  const lfoGain = ctx.createGain()

  osc.type = 'sine'
  gain.gain.value = 0
  lfo.type = 'sine'
  lfo.frequency.value = 0.2
  lfoGain.gain.value = 2

  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  osc.connect(gain)
  gain.connect(destination)
  osc.start()
  lfo.start()

  return { osc, gain, lfo, lfoGain }
}

function createAmbientEngine(ctx: AudioContext, config: SonificationConfig) {
  const masterGain = ctx.createGain()
  masterGain.gain.value = config.volume * 0.5
  masterGain.connect(ctx.destination)

  const reverb = createReverb(ctx)
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = 1 - config.reverbMix
  wetGain.gain.value = config.reverbMix
  masterGain.connect(dryGain)
  dryGain.connect(ctx.destination)
  masterGain.connect(reverb.input)
  reverb.output.connect(wetGain)
  wetGain.connect(ctx.destination)

  const filterMaster = ctx.createBiquadFilter()
  filterMaster.type = 'lowpass'
  filterMaster.frequency.value = 3000
  filterMaster.Q.value = 0.5
  masterGain.disconnect()
  masterGain.connect(filterMaster)
  filterMaster.connect(dryGain)
  filterMaster.connect(reverb.input)

  const maxVoices = 12
  const drones: DroneOsc[] = []
  for (let i = 0; i < maxVoices; i++) {
    drones.push(createDroneVoice(ctx, masterGain))
  }

  function update(flame: FlameDescriptor): void {
    const transforms = Object.entries(flame.transforms).filter(
      ([, t]) => t.visible,
    )
    const transformCount = Math.max(1, transforms.length)
    const scale = getScale(config)

    // Total variation count across all transforms → complexity
    let totalVariations = 0
    for (const [, t] of transforms) {
      totalVariations += Object.keys(t.variations).length
    }
    const complexity = clamp(
      totalVariations / Math.max(1, transformCount),
      1,
      8,
    )

    // Active drone voices based on complexity
    const activeVoices = Math.min(
      maxVoices,
      Math.floor(complexity * config.harmonicDensity * 1.5),
    )

    // Fundamental drone tone from first transform
    const rootTransform = transforms[0]?.[1]
    const rootNote =
      scale[
        Math.floor(
          (((rootTransform?.color.x ?? 0) + 0.4) / 0.8) * (scale.length - 1),
        )
      ] ?? scale[0]!

    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i]!
      if (i < activeVoices) {
        // Harmonic series above root
        const harmonic = i + 1
        const freq = rootNote * harmonic
        drone.osc.type = i === 0 ? 'sine' : i % 3 === 0 ? 'triangle' : 'sine'
        drone.osc.frequency.linearRampToValueAtTime(freq, ctx.currentTime + 0.1)

        // Higher harmonics are quieter
        const targetGain = (0.08 / harmonic) * config.volume
        drone.gain.gain.linearRampToValueAtTime(
          targetGain,
          ctx.currentTime + 0.15,
        )

        // LFO modulation from transform count
        drone.lfo.frequency.value =
          0.1 + (transformCount / 10) * config.harmonicDensity
        drone.lfoGain.gain.value = 0.5 + complexity * 0.3
      } else {
        // Mute unused
        drone.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3)
      }
    }

    // Filter cutoff from camera zoom (or first transform weight)
    const zoom = flame.renderSettings.camera?.zoom ?? 1
    const filterFreq = clamp(500 + zoom * 2000, 300, 8000)
    filterMaster.frequency.linearRampToValueAtTime(
      filterFreq,
      ctx.currentTime + 0.1,
    )

    // Reverb from camera zoom
    const reverbTarget = clamp((zoom - 0.5) / 5, 0, config.reverbMix)
    dryGain.gain.linearRampToValueAtTime(
      1 - reverbTarget,
      ctx.currentTime + 0.1,
    )
    wetGain.gain.linearRampToValueAtTime(reverbTarget, ctx.currentTime + 0.1)
  }

  function setVolume(v: number): void {
    masterGain.gain.linearRampToValueAtTime(v * 0.5, ctx.currentTime + 0.05)
  }

  function setReverbMix(_mix: number): void {
    /* Ambient engine reads reverbMix from the shared config object directly
		   in update(), where it acts as an upper bound for zoom-driven reverb.
		   No per-call action needed — the slider works via config.reverbMix. */
  }

  function dispose(): void {
    for (const drone of drones) {
      try {
        drone.osc.stop()
        drone.lfo.stop()
      } catch {
        /* already stopped */
      }
      drone.osc.disconnect()
      drone.gain.disconnect()
      drone.lfo.disconnect()
      drone.lfoGain.disconnect()
    }
    masterGain.disconnect()
    filterMaster.disconnect()
    dryGain.disconnect()
    wetGain.disconnect()
    reverb.input.disconnect()
    reverb.output.disconnect()
  }

  return { update, setVolume, setReverbMix, dispose }
}

// --- Percussive model ---

type DrumType = 'kick' | 'snare' | 'hihat' | 'tom'

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 0.4)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

/**
 * Which drum a transform plays.
 *
 * Derived from the transform id so it is STABLE: the same transform is always
 * the same instrument, which is what makes a repeating pattern audible as a
 * pattern. It used to be `voices[voiceIdx++]` with `voiceIdx` reset on every
 * update — and since the probability gate usually lets exactly one transform
 * through per call, nearly every hit landed on voices[0], the kick.
 */
function drumTypeFor(tid: string): DrumType {
  let h = 0
  for (let i = 0; i < tid.length; i++) {
    h = (Math.imul(h, 31) + tid.charCodeAt(i)) | 0
  }
  return DRUM_TYPES[Math.abs(h) % DRUM_TYPES.length]!
}

/**
 * Fire one drum hit, building its nodes and letting them fall away when done.
 *
 * Per-hit nodes rather than a pool of persistent "voices": one-shots are what
 * the Web Audio API is built around, and a shared voice retriggered before its
 * envelope finished used to cut itself off.
 *
 * Kick and tom are SYNTHESISED, not filtered noise. The old versions ran white
 * noise through a lowpass at 80 Hz (kick) and a Q=3 bandpass at 200 Hz (tom),
 * which keep well under 1% of the noise's energy — inaudible on anything but
 * headphones with the volume up. A drum with a body needs a pitched sine whose
 * frequency drops fast; that is what makes a kick sound like a kick.
 */
function triggerDrum(
  ctx: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  type: DrumType,
  when: number,
  velocity: number,
  pan: number,
  /** 0-1, from the transform's colour — nudges pitch/brightness per hit. */
  tone: number,
): void {
  const panner = ctx.createStereoPanner()
  panner.pan.value = clamp(pan, -1, 1)
  panner.connect(destination)

  const gain = ctx.createGain()
  gain.connect(panner)

  const decay =
    type === 'kick'
      ? 0.34
      : type === 'tom'
        ? 0.26
        : type === 'snare'
          ? 0.16
          : 0.06

  gain.gain.setValueAtTime(Math.max(0.0001, velocity), when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + decay)

  const stopAt = when + decay + 0.02

  if (type === 'kick' || type === 'tom') {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    const start = type === 'kick' ? 150 : 260 + tone * 140
    const end = type === 'kick' ? 45 : 95 + tone * 45
    osc.frequency.setValueAtTime(start, when)
    osc.frequency.exponentialRampToValueAtTime(end, when + decay * 0.35)
    osc.connect(gain)
    osc.start(when)
    osc.stop(stopAt)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
      panner.disconnect()
    }
    return
  }

  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer
  const filter = ctx.createBiquadFilter()
  if (type === 'hihat') {
    filter.type = 'highpass'
    filter.frequency.value = 7000 + tone * 2000
    filter.Q.value = 0.7
  } else {
    filter.type = 'bandpass'
    filter.frequency.value = 1400 + tone * 900
    filter.Q.value = 0.9
  }
  src.connect(filter)
  filter.connect(gain)
  src.start(when)
  src.stop(stopAt)
  src.onended = () => {
    src.disconnect()
    filter.disconnect()
    gain.disconnect()
    panner.disconnect()
  }
}

const DRUM_TYPES: DrumType[] = ['kick', 'snare', 'hihat', 'tom']

function createPercussiveEngine(ctx: AudioContext, config: SonificationConfig) {
  const masterGain = ctx.createGain()
  masterGain.gain.value = config.volume

  /* Dry and wet BOTH hang off masterGain and nothing else reaches the
     destination. masterGain used to also connect straight to ctx.destination
     on top of the dry path, so the dry signal was always at full level and
     turning the reverb up only ever added — the mix control could not mix. */
  const reverb = createReverb(ctx)
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  dryGain.gain.value = 1 - config.reverbMix
  wetGain.gain.value = config.reverbMix
  masterGain.connect(dryGain)
  dryGain.connect(ctx.destination)
  masterGain.connect(reverb.input)
  reverb.output.connect(wetGain)
  wetGain.connect(ctx.destination)

  const noiseBuffer = createNoiseBuffer(ctx)

  // Track last trigger time per transform to enforce rate limit
  const lastTrigger = new Map<string, number>()

  function update(flame: FlameDescriptor): void {
    const now = ctx.currentTime
    const transforms = Object.entries(flame.transforms).filter(
      ([, t]) => t.visible,
    )
    if (transforms.length === 0) return

    for (const [tid, t] of transforms) {
      const probability = t.probability ?? 1 / transforms.length
      const last = lastTrigger.get(tid) ?? 0
      // Rate scales with the transform's own weight, but a rare transform must
      // still be heard occasionally rather than effectively never: clamp the
      // gap instead of letting 1/(rate*p) run away as p approaches 0.
      const minInterval = clamp(
        1 / (config.triggerRate * Math.max(probability, 0.05)),
        0.08,
        4,
      )

      if (now - last < minInterval) continue
      // A weight is how OFTEN it fires (the interval above), not an extra coin
      // flip on top — the old `Math.random() > p * 1.2` skipped ~70% of the
      // hits a typical 4-transform flame had already earned.
      lastTrigger.set(tid, now)

      // Loud enough to hear across the range of weights; a 0.25-weight
      // transform used to land at 0.225 after the extra 0.6 factor.
      const velocity = clamp(0.35 + probability * 0.8, 0.35, 1)
      const pan = clamp(t.color.x * config.spatialSpread * 2, -1, 1)
      const tone = clamp(t.color.y, 0, 1)

      triggerDrum(
        ctx,
        masterGain,
        noiseBuffer,
        drumTypeFor(tid),
        now,
        velocity,
        pan,
        tone,
      )
    }
  }

  function setVolume(v: number): void {
    masterGain.gain.linearRampToValueAtTime(v, ctx.currentTime + 0.05)
  }

  function setReverbMix(mix: number): void {
    dryGain.gain.linearRampToValueAtTime(1 - mix, ctx.currentTime + 0.05)
    wetGain.gain.linearRampToValueAtTime(mix, ctx.currentTime + 0.05)
  }

  function dispose(): void {
    // Hits own their own nodes and disconnect themselves in `onended`; there is
    // no persistent voice pool left to tear down. Dropping masterGain also
    // orphans anything still ringing.
    masterGain.disconnect()
    dryGain.disconnect()
    wetGain.disconnect()
    reverb.input.disconnect()
    reverb.output.disconnect()
  }

  return { update, setVolume, setReverbMix, dispose }
}

// --- Simple convolution reverb (generated impulse response) ---

function createReverb(ctx: AudioContext): {
  input: GainNode
  output: ConvolverNode
} {
  const input = ctx.createGain()
  const convolver = ctx.createConvolver()
  const output = convolver

  // Generate a simple impulse response: decaying noise
  const length = ctx.sampleRate * 1.5
  const ir = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      const t = i / length
      data[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.3
    }
  }
  convolver.buffer = ir
  input.connect(convolver)

  return { input, output }
}

// --- Public API ---

export type SonificationEngine = {
  update: (flame: FlameDescriptor) => void
  setVolume: (v: number) => void
  setConfig: (partial: Partial<SonificationConfig>) => void
  dispose: () => void
}

export function createSonificationEngine(
  config: Partial<SonificationConfig> = {},
): SonificationEngine {
  const fullConfig: SonificationConfig = { ...DEFAULT_CONFIG, ...config }
  const ctx = new AudioContext()

  let engine: ReturnType<
    | typeof createOrchestralEngine
    | typeof createAmbientEngine
    | typeof createPercussiveEngine
  >

  function buildEngine(): void {
    // Dispose old engine nodes
    engine?.dispose()

    switch (fullConfig.model) {
      case 'orchestral':
        engine = createOrchestralEngine(ctx, fullConfig)
        break
      case 'ambient':
        engine = createAmbientEngine(ctx, fullConfig)
        break
      case 'percussive':
        engine = createPercussiveEngine(ctx, fullConfig)
        break
    }
  }

  buildEngine()

  return {
    update(flame: FlameDescriptor): void {
      if (ctx.state === 'suspended') {
        void ctx.resume()
      }
      engine.update(flame)
    },
    setVolume(v: number): void {
      engine.setVolume(v)
    },
    setConfig(partial: Partial<SonificationConfig>): void {
      const oldModel = fullConfig.model
      Object.assign(fullConfig, partial)
      if (partial.model !== undefined && partial.model !== oldModel) {
        buildEngine()
      }
      engine.setVolume(fullConfig.volume)
      engine.setReverbMix?.(fullConfig.reverbMix)
    },
    dispose(): void {
      engine.dispose()
      void ctx.close()
    },
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}
