import { projectFlameValue } from '@chaos-master/core'

const BAND_RANGES: [number, number][] = [
  [20, 60], // sub-bass
  [60, 250], // bass
  [250, 500], // low-mid
  [500, 2000], // mid
  [2000, 4000], // hi-mid
  [4000, 6000], // presence
  [6000, 20000], // brilliance
  [20, 20000], // full spectrum
]

const BAND_COUNT = BAND_RANGES.length

export type FrameData = {
  bands: number[]
  rms: number
  centroid: number
  flatness: number
  onsetStrength: number
}

export type AudioAnalyzer = {
  getFrameData(frameIndex: number): FrameData & { isBeat: boolean }
  totalFrames: number
  duration: number
  sampleRate: number
}

export type LiveAudioAnalyzer = {
  getFrameData(): FrameData & { isBeat: boolean }
  sampleRate: number
  dispose(): void
}

// --- Radix-2 FFT (iterative, in-place) ---

function reverseBits(n: number, bits: number): number {
  let r = 0
  for (let i = 0; i < bits; i++) {
    r = (r << 1) | (n & 1)
    n >>= 1
  }
  return r
}

function fft(real: Float64Array, imag: Float64Array): void {
  const N = real.length
  const bits = Math.log2(N)
  if ((bits | 0) !== bits) return // N must be power of 2

  // Bit-reversal permutation
  for (let i = 0; i < N; i++) {
    const j = reverseBits(i, bits)
    if (j > i) {
      ;[real[i], real[j]] = [real[j]!, real[i]!]
      ;[imag[i], imag[j]] = [imag[j]!, imag[i]!]
    }
  }

  // Cooley-Tukey
  for (let size = 2; size <= N; size <<= 1) {
    const half = size >> 1
    const angle = (-2 * Math.PI) / size
    for (let block = 0; block < N; block += size) {
      for (let k = 0; k < half; k++) {
        const cos = Math.cos(angle * k)
        const sin = Math.sin(angle * k)
        const ri = block + k
        const rj = block + k + half
        const tr = real[rj]! * cos - imag[rj]! * sin
        const ti = real[rj]! * sin + imag[rj]! * cos
        real[rj] = real[ri]! - tr
        imag[rj] = imag[ri]! - ti
        real[ri] = real[ri]! + tr
        imag[ri] = imag[ri]! + ti
      }
    }
  }
}

function fftMagnitudeSpectrum(
  data: Float32Array,
  _sampleRate: number,
): { bands: number[]; centroid: number; flatness: number } {
  const N = data.length
  const real = new Float64Array(N)
  for (let i = 0; i < N; i++) real[i] = data[i] ?? 0
  const imag = new Float64Array(N)

  fft(real, imag)

  const halfSize = N / 2
  const mags = new Float32Array(halfSize)
  for (let k = 0; k < halfSize; k++) {
    mags[k] = Math.sqrt(real[k]! * real[k]! + imag[k]! * imag[k]!) / N
  }

  return getFftBands(mags, _sampleRate)
}

function getFftBands(
  fftData: Float32Array,
  sampleRate: number,
): { bands: number[]; centroid: number; flatness: number } {
  const binCount = fftData.length
  const nyquist = sampleRate / 2
  const bands = new Array(BAND_COUNT).fill(0) as number[]
  const bandBinCounts = new Array(BAND_COUNT).fill(0) as number[]

  for (let i = 0; i < binCount; i++) {
    const freq = (i / binCount) * nyquist
    const mag = fftData[i]!
    for (let b = 0; b < BAND_COUNT; b++) {
      const [low, high] = BAND_RANGES[b]!
      if (freq >= low && freq < high) {
        bands[b] = (bands[b] ?? 0) + mag
        bandBinCounts[b]!++
      }
    }
  }

  for (let b = 0; b < BAND_COUNT; b++) {
    if (bandBinCounts[b]! > 0) {
      bands[b] = bands[b]! / bandBinCounts[b]!
    }
  }

  let weightedSum = 0
  let totalMag = 0
  for (let i = 0; i < binCount; i++) {
    const freq = (i / binCount) * nyquist
    const mag = fftData[i]!
    weightedSum += freq * mag
    totalMag += mag
  }
  const centroid = totalMag > 0 ? weightedSum / totalMag : 0

  let logSum = 0
  let linSum = 0
  let nonZeroCount = 0
  for (let i = 0; i < binCount; i++) {
    const mag = fftData[i]!
    if (mag > 1e-10) {
      logSum += Math.log(mag)
      linSum += mag
      nonZeroCount++
    }
  }
  const flatness =
    nonZeroCount > 1 && linSum > 0
      ? Math.exp(logSum / nonZeroCount) / (linSum / nonZeroCount)
      : 0

  return { bands, centroid, flatness }
}

function computeRms(data: Float32Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i]! * data[i]!
  }
  return Math.sqrt(sum / data.length)
}

/** Decode encoded audio bytes -- a fetched or uploaded file -- into a buffer. */
export async function decodeAudioBytes(
  bytes: ArrayBuffer,
): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(bytes)
  } finally {
    void ctx.close()
  }
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  return decodeAudioBytes(await file.arrayBuffer())
}

// --- Beat detection ---

function computeBeats(
  totalFrames: number,
  getData: (i: number) => { bands: number[]; rms: number },
): Set<number> {
  const beats = new Set<number>()
  if (totalFrames < 2) return beats

  const flux: number[] = []
  for (let i = 0; i < totalFrames; i++) {
    const data = getData(i)
    if (i === 0) {
      flux.push(0)
    } else {
      const prev = getData(i - 1)
      let diff = 0
      for (let b = 0; b < BAND_COUNT; b++) {
        const d = (data.bands[b] ?? 0) - (prev.bands[b] ?? 0)
        if (d > 0) diff += d
      }
      flux.push(diff)
    }
  }

  const mean = flux.reduce((a, b) => a + b, 0) / flux.length
  const variance = flux.reduce((a, b) => a + (b - mean) ** 2, 0) / flux.length
  const threshold = mean + 1.5 * Math.sqrt(variance)

  const minGapFrames = Math.max(1, Math.floor(0.1 * 30))
  let lastBeatFrame = -minGapFrames

  for (let i = 1; i < flux.length; i++) {
    if (
      flux[i]! > threshold &&
      flux[i]! > flux[i - 1]! &&
      i - lastBeatFrame >= minGapFrames
    ) {
      beats.add(i)
      lastBeatFrame = i
    }
  }

  return beats
}

// --- Onset detection ---
// Onset strength = positive delta of RMS × centroid, normalized against a
// rolling median. Produces a 0-1 value per frame; values > 0 indicate an
// onset transient (drum hit, plosive, sharp attack). The caller applies an
// exponential decay envelope (50-100ms half-life) to smooth the visual effect.

function computeOnsetStrengths(
  totalFrames: number,
  getData: (i: number) => { rms: number; centroid: number },
): Float32Array {
  const strengths = new Float32Array(totalFrames)
  if (totalFrames < 3) return strengths

  // Compute frame-to-frame energy deltas
  const deltas: number[] = []
  for (let i = 1; i < totalFrames; i++) {
    const prev = getData(i - 1)
    const curr = getData(i)
    const prevEnergy = prev.rms * Math.max(1, prev.centroid)
    const currEnergy = curr.rms * Math.max(1, curr.centroid)
    deltas.push(Math.max(0, currEnergy - prevEnergy))
  }

  // Rolling median over a window of ~0.5s worth of frames
  const windowSize = Math.max(3, Math.min(15, Math.floor(deltas.length / 2)))
  const thresholdFactor = 2.5

  for (let i = 1; i < totalFrames; i++) {
    const delta = deltas[i - 1]!

    // Compute rolling median of nearby deltas (exclude current)
    const windowStart = Math.max(0, i - 1 - windowSize)
    const windowEnd = Math.min(deltas.length - 1, i - 1 + windowSize)
    const window: number[] = []
    for (let j = windowStart; j <= windowEnd; j++) {
      if (j !== i - 1) window.push(deltas[j]!)
    }
    window.sort((a, b) => a - b)
    const median =
      window.length > 0 ? window[Math.floor(window.length / 2)]! : 0

    if (delta > median * thresholdFactor && median > 1e-8) {
      strengths[i] = Math.min(1, delta / (median * thresholdFactor * 2))
    }
  }

  return strengths
}

// --- Public API ---

export async function createAudioAnalyzer(
  audioBuffer: AudioBuffer,
  targetFps: number,
  onProgress?: (current: number, total: number) => void,
): Promise<AudioAnalyzer> {
  const { sampleRate, length, duration, numberOfChannels } = audioBuffer

  // Mix down to mono
  const monoData = new Float32Array(length)
  if (numberOfChannels === 1) {
    monoData.set(audioBuffer.getChannelData(0))
  } else {
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelData = audioBuffer.getChannelData(ch)
      for (let i = 0; i < length; i++) {
        monoData[i] = (monoData[i] ?? 0) + channelData[i]!
      }
    }
    for (let i = 0; i < length; i++) {
      monoData[i] = monoData[i]! / numberOfChannels
    }
  }

  const samplesPerFrame = Math.floor(sampleRate / targetFps)
  const totalFrames = Math.floor(length / samplesPerFrame)
  const fftSize = Math.max(256, nextPowerOfTwo(samplesPerFrame))

  onProgress?.(0, totalFrames)

  // Analyze every frame up front — with a proper FFT this is ~1s for a 3min song.
  const frameCache = new Map<number, FrameData>()

  function getOrComputeFrame(i: number): FrameData {
    let frame = frameCache.get(i)
    if (frame) return frame

    const start = i * samplesPerFrame
    const end = Math.min(start + samplesPerFrame, length)
    const slice = monoData.slice(start, end)
    const padded = new Float32Array(fftSize)
    padded.set(slice)

    const { bands, centroid, flatness } = fftMagnitudeSpectrum(
      padded,
      sampleRate,
    )
    const rms = computeRms(slice)

    frame = { bands, rms, centroid, flatness, onsetStrength: 0 }
    frameCache.set(i, frame)
    onProgress?.(i + 1, totalFrames)
    return frame
  }

  // Pre-compute all frames in chunks so the UI stays responsive
  const BATCH_SIZE = 50
  for (let i = 0; i < totalFrames; i++) {
    getOrComputeFrame(i)
    if (i % BATCH_SIZE === 0 && i > 0) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }

  const beatFrames = computeBeats(totalFrames, getOrComputeFrame)

  // Compute onset strengths and patch into frame cache
  const onsetStrengths = computeOnsetStrengths(totalFrames, getOrComputeFrame)
  for (let i = 0; i < totalFrames; i++) {
    const frame = frameCache.get(i)
    if (frame) frame.onsetStrength = onsetStrengths[i] ?? 0
  }

  return {
    getFrameData(frameIndex: number) {
      const clampedIndex = Math.max(0, Math.min(frameIndex, totalFrames - 1))
      const data = getOrComputeFrame(clampedIndex)
      return { ...data, isBeat: beatFrames.has(clampedIndex) }
    },
    totalFrames,
    duration,
    sampleRate,
  }
}

function nextPowerOfTwo(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

export function detectBeats(frames: FrameData[]): Set<number> {
  return computeBeats(frames.length, (i) => {
    const fd = frames[i]!
    return { bands: fd.bands, rms: fd.rms }
  })
}

// --- Live microphone analyzer ---

function detectBeatFromHistory(history: FrameData[]): boolean {
  if (history.length < 4) return false
  const fluxes: number[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1]!
    const curr = history[i]!
    let diff = 0
    for (let b = 0; b < BAND_COUNT; b++) {
      const d = (curr.bands[b] ?? 0) - (prev.bands[b] ?? 0)
      if (d > 0) diff += d
    }
    fluxes.push(diff)
  }
  const mean = fluxes.reduce((a, b) => a + b, 0) / fluxes.length
  const variance =
    fluxes.reduce((a, b) => a + (b - mean) ** 2, 0) / fluxes.length
  const threshold = mean + 1.5 * Math.sqrt(variance)
  const latest = fluxes[fluxes.length - 1]!
  const previous = fluxes.length > 1 ? fluxes[fluxes.length - 2]! : 0
  return latest > threshold && latest > previous
}

/** Creates a real-time audio analyzer from the microphone. Uses Web Audio
 *  AnalyserNode for FFT data, producing FrameData compatible with the
 *  file-based analyzer so the same applyAudioMappingsToFlame works unchanged. */
export async function createLiveAnalyzer(
  targetFps: number = 30,
): Promise<LiveAudioAnalyzer> {
  const stream = await globalThis.navigator.mediaDevices.getUserMedia({
    audio: true,
  })
  const audioCtx = new AudioContext()
  const sampleRate = audioCtx.sampleRate

  const source = audioCtx.createMediaStreamSource(stream)
  const analyser = audioCtx.createAnalyser()

  const samplesPerFrame = Math.floor(sampleRate / targetFps)
  const fftSize = Math.max(256, nextPowerOfTwo(samplesPerFrame))
  analyser.fftSize = fftSize
  analyser.smoothingTimeConstant = 0.3

  source.connect(analyser)

  const history: FrameData[] = []
  const maxHistory = Math.ceil(targetFps * 2)
  const minGapFrames = Math.max(1, Math.floor(0.1 * targetFps))
  let lastBeatAt = -minGapFrames
  let frameCount = 0

  // Onset detection state — tracks recent energy deltas for rolling median.
  const onsetDeltaHistory: number[] = []
  const onsetWindowSize = 15
  let prevOnsetEnergy = 0

  // Pre-allocated FFT buffers reused every frame to avoid GC pressure at 30fps.
  const fftReal = new Float64Array(fftSize)
  const fftImag = new Float64Array(fftSize)
  const fftMags = new Float32Array(fftSize / 2)
  const timeData = new Float32Array(fftSize)

  const getFrameData = (): FrameData & { isBeat: boolean } => {
    analyser.getFloatTimeDomainData(timeData)

    // Inline FFT reusing pre-allocated buffers (same algorithm as fftMagnitudeSpectrum).
    for (let i = 0; i < fftSize; i++) fftReal[i] = timeData[i] ?? 0
    fftImag.fill(0)
    fft(fftReal, fftImag)
    for (let k = 0; k < fftSize / 2; k++) {
      fftMags[k] =
        Math.sqrt(fftReal[k]! * fftReal[k]! + fftImag[k]! * fftImag[k]!) /
        fftSize
    }
    const { bands, centroid, flatness } = getFftBands(fftMags, sampleRate)
    const rms = computeRms(timeData)

    // Onset strength from frame-to-frame energy delta
    const energy = rms * Math.max(1, centroid)
    const delta = Math.max(0, energy - prevOnsetEnergy)
    prevOnsetEnergy = energy

    onsetDeltaHistory.push(delta)
    if (onsetDeltaHistory.length > onsetWindowSize) onsetDeltaHistory.shift()

    let onsetStrength = 0
    if (onsetDeltaHistory.length >= 3) {
      const sorted = [...onsetDeltaHistory].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)]!
      if (delta > median * 2.5 && median > 1e-8) {
        onsetStrength = Math.min(1, delta / (median * 5))
      }
    }

    const frame: FrameData = { bands, rms, centroid, flatness, onsetStrength }

    history.push(frame)
    if (history.length > maxHistory) history.shift()

    const isBeatCurrent =
      frameCount - lastBeatAt >= minGapFrames && detectBeatFromHistory(history)
    if (isBeatCurrent) lastBeatAt = frameCount

    frameCount++
    return { ...frame, isBeat: isBeatCurrent }
  }

  return {
    getFrameData,
    sampleRate,
    dispose() {
      stream.getTracks().forEach((t) => {
        t.stop()
      })
      source.disconnect()
      analyser.disconnect()
      void audioCtx.close()
    },
  }
}

// --- Audio→Flame mapping (shared between live preview and export) ---

export type AudioFeature =
  | 'subBass'
  | 'bass'
  | 'lowMid'
  | 'mid'
  | 'hiMid'
  | 'presence'
  | 'brilliance'
  | 'fullSpectrum'
  | 'rms'
  | 'centroid'
  | 'flatness'
  | 'beat'
  | 'onset'

export type RenderSettingKey =
  | 'vibrancy'
  | 'exposure'
  | 'palettePhase'
  | 'paletteSpeed'
  | 'contrast'
  | 'gamma'
  | 'highlightPower'
  | 'lightPower'
  | 'depthColorPower'
  | 'zoom'
  | 'skipIters'

export type AffineKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f'

export type TransformPropertyKey =
  | 'probability'
  | 'colorX'
  | 'colorY'
  | 'colorSpeed'

/** Encodes the exact target path in a FlameDescriptor to drive from audio. */
export type FlameTarget =
  | { kind: 'renderSetting'; param: RenderSettingKey }
  | {
      kind: 'transformAffine'
      transformIdx: number
      matrix: 'preAffine' | 'postAffine'
      param: AffineKey
    }
  | {
      kind: 'transformProperty'
      transformIdx: number
      property: TransformPropertyKey
    }
  | {
      kind: 'variationWeight'
      transformIdx: number
      variationType: string
    }
  | { kind: 'finalAffine'; param: AffineKey }

/** Stable string key for dirty-check state (keyed by target identity). */
export function flameTargetKey(target: FlameTarget): string {
  switch (target.kind) {
    case 'renderSetting':
      return `render.${target.param}`
    case 'transformAffine':
      return `tx.${target.transformIdx}.${target.matrix}.${target.param}`
    case 'transformProperty':
      return `tx.${target.transformIdx}.prop.${target.property}`
    case 'variationWeight':
      return `tx.${target.transformIdx}.var.${target.variationType}.weight`
    case 'finalAffine':
      return `final.${target.param}`
  }
}

export type AudioMappingEntry = {
  audioFeature: AudioFeature
  target: FlameTarget
  sensitivity: number
  range: [number, number]
  attackMs?: number
  releaseMs?: number
}

/**
 * Lightweight transform info passed from MainWorkspace so the panel can
 * show per-transform dropdowns without carrying the full flame descriptor.
 */
export type TransformInfo = {
  id: string
  index: number
  label: string
  /** Available variation IDs and types for this transform (for pill picker). */
  variations: { id: string; type: string }[]
}

export function getAudioFeatureNormalized(
  frameData: FrameData & { isBeat: boolean },
  feature: AudioFeature,
): number {
  if (feature === 'beat') return frameData.isBeat ? 1 : 0
  if (feature === 'onset') return frameData.onsetStrength
  if (feature === 'rms') return Math.min(1, frameData.rms)
  if (feature === 'centroid') return Math.min(1, frameData.centroid / 20000)
  if (feature === 'flatness') return frameData.flatness
  const bandMap: Record<string, number> = {
    subBass: 0,
    bass: 1,
    lowMid: 2,
    mid: 3,
    hiMid: 4,
    presence: 5,
    brilliance: 6,
    fullSpectrum: 7,
  }
  const idx = bandMap[feature]
  if (idx !== undefined) return Math.min(1, frameData.bands[idx]!)
  return 0
}

function mappingToVal(
  normalizedValue: number,
  mapping: AudioMappingEntry,
): number {
  const [lo, hi] = mapping.range
  return lo + normalizedValue * mapping.sensitivity * (hi - lo)
}

/** Per-mapping smoothing + dirty-check state, keyed by target identity. */
export type MappingSmoothingState = Map<
  string,
  { smoothed: number; lastApplied: number }
>

const DIRTY_THRESHOLD = 0.005 // 0.5% change threshold

/**
 * A modulated render setting held to the domain the flame schema gives it.
 *
 * A mapping whose range exceeds the schema does not merely look wrong — a
 * flame carrying the result is INVALID, and `validateFlame` then throws for
 * everything downstream: breeding it, exporting it, opening the ancestry tree.
 * Observed in the wild as `palettePhase: Expected <=1 but received 1.589`,
 * back when modulation wrote the open document and left that flame unable to
 * be bred again. The live path is a render-time overlay now, but an export
 * still embeds the modulated flame in the file it writes, so an out-of-range
 * value would ship inside it.
 *
 * A range is authored by hand in the wiring editor and shipped in presets, so
 * neither can be trusted to respect a bound it never sees. The projection is
 * the schema's own (`projectFlameValue`), the one the timeline and the
 * commands use: skipIters floors as the renderer reads it, palettePhase wraps
 * as fract() reads it, and every other bound clamps.
 */
function heldRenderSetting(
  param: RenderSettingKey,
  value: number,
  dimensions: unknown,
): number {
  const path = param === 'zoom' ? ['camera', 'zoom'] : [param]
  // NaN would fail validation as surely as an out-of-range number, and can
  // arrive from a degenerate range. Its stand-in, 0, is projected like any
  // other value: it is below gamma's and contrast's minimum.
  return projectFlameValue(
    ['renderSettings', ...path],
    Number.isFinite(value) ? value : 0,
    dimensions,
  ) as number
}

interface AudioMutationContext {
  rs?: Record<string, unknown>
  camera?: Record<string, unknown>
  txArr?: Record<string, unknown>[]
}

/**
 * Calculates attack/release envelope smoothing for a normalized feature.
 */
function computeSmoothedEnvelope(
  clamped: number,
  targetKey: string,
  mapping: AudioMappingEntry,
  smoothingState: MappingSmoothingState | undefined,
  dt: number,
): number {
  const attackMs = mapping.attackMs ?? 0
  const releaseMs = mapping.releaseMs ?? 0
  if (attackMs <= 0 && releaseMs <= 0) {
    return clamped
  }

  const prev = smoothingState?.get(targetKey)?.smoothed ?? clamped
  const rising = clamped > prev
  const tc =
    (rising
      ? (mapping.attackMs ?? mapping.releaseMs ?? 0)
      : (mapping.releaseMs ?? mapping.attackMs ?? 0)) / 1000
  if (tc <= 0) {
    return clamped
  }

  const coeff = dt / (tc + dt)
  return prev + coeff * (clamped - prev)
}

/**
 * Settles one target's value for this frame, and says whether it moved.
 *
 * Two answers, not one, because the overlay needs both. The value is written
 * EVERY frame: the overlay is rebuilt from the authored flame each time, so a
 * target left out snaps back to what the user authored and the picture
 * judders between modulated and unmodulated. `changed` is the separate
 * question of whether this frame is worth publishing at all.
 *
 * Holding `lastApplied` below the threshold is what keeps a still target
 * still — the smoothed value keeps creeping, the written one does not.
 */
function settleTargetValue(
  smoothed: number,
  targetKey: string,
  smoothingState: MappingSmoothingState | undefined,
): { applied: number; changed: boolean } {
  const prevApplied = smoothingState?.get(targetKey)?.lastApplied
  if (
    prevApplied !== undefined &&
    Math.abs(smoothed - prevApplied) < DIRTY_THRESHOLD
  ) {
    if (smoothingState) {
      smoothingState.set(targetKey, { smoothed, lastApplied: prevApplied })
    }
    return { applied: prevApplied, changed: false }
  }

  if (smoothingState) {
    smoothingState.set(targetKey, { smoothed, lastApplied: smoothed })
  }
  return { applied: smoothed, changed: true }
}

function applyRenderSettingTarget(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
  tgt: Extract<FlameTarget, { kind: 'renderSetting' }>,
  val: number,
): void {
  ctx.rs ??= (flame.renderSettings as Record<string, unknown>) ?? {}
  const safe = heldRenderSetting(tgt.param, val, ctx.rs.dimensions)
  if (tgt.param === 'zoom') {
    ctx.camera ??= (ctx.rs.camera as Record<string, unknown>) ?? {}
    ;(ctx.camera as Record<string, number>).zoom = safe
  } else {
    ;(ctx.rs as Record<string, number>)[tgt.param] = safe
  }
}

function getOrCreateTransformArray(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
): Record<string, unknown>[] {
  ctx.txArr ??= Object.values(
    (flame.transforms as Record<string, Record<string, unknown>>) ?? {},
  )
  return ctx.txArr
}

function applyTransformAffineTarget(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
  tgt: Extract<FlameTarget, { kind: 'transformAffine' }>,
  val: number,
): void {
  const txArr = getOrCreateTransformArray(flame, ctx)
  const tx = txArr[tgt.transformIdx]
  if (!tx) return
  const mat = (tx[tgt.matrix] as Record<string, number> | undefined) ?? {}
  mat[tgt.param] = val
  tx[tgt.matrix] = mat
}

function applyTransformPropertyTarget(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
  tgt: Extract<FlameTarget, { kind: 'transformProperty' }>,
  val: number,
): void {
  const txArr = getOrCreateTransformArray(flame, ctx)
  const tx = txArr[tgt.transformIdx]
  if (!tx) return

  if (tgt.property === 'colorX' || tgt.property === 'colorY') {
    const color = (tx.color as Record<string, number>) ?? { x: 0, y: 0 }
    if (tgt.property === 'colorX') color.x = val
    else color.y = val
    tx.color = color
  } else if (tgt.property === 'probability') {
    /*
     * Never let a transform's weight reach zero.
     *
     * The chaos game picks transforms by probability; at zero a branch
     * stops receiving points and vanishes, and if every weight is driven
     * low together the whole picture thins out to noise — the "flame
     * collapsed and looks like nothing" people report mid-track. A
     * negative weight is worse: it makes the cumulative distribution
     * non-monotonic, so selection is meaningless.
     *
     * The schema itself only says `v.number()`, so nothing downstream
     * would have caught either.
     */
    ;(tx as Record<string, number>).probability = Math.max(
      0.001,
      Number.isFinite(val) ? val : 0.001,
    )
  } else {
    ;(tx as Record<string, number>)[tgt.property] = Number.isFinite(val)
      ? val
      : 0
  }
}

function applyVariationWeightTarget(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
  tgt: Extract<FlameTarget, { kind: 'variationWeight' }>,
  val: number,
): void {
  const txArr = getOrCreateTransformArray(flame, ctx)
  const tx = txArr[tgt.transformIdx]
  if (!tx) return
  const vars = (tx.variations as Record<string, Record<string, unknown>>) ?? {}
  const v =
    vars[tgt.variationType] ??
    Object.values(vars).find(
      (candidate) => candidate.type === tgt.variationType,
    )
  if (v) {
    ;(v as Record<string, number>).weight = val
  }
}

function applyFinalAffineTarget(
  flame: Record<string, unknown>,
  tgt: Extract<FlameTarget, { kind: 'finalAffine' }>,
  val: number,
): void {
  const fin = (flame.finalTransform as Record<string, number> | undefined) ?? {}
  fin[tgt.param] = val
  flame.finalTransform = fin
}

function dispatchAudioTargetMapping(
  flame: Record<string, unknown>,
  ctx: AudioMutationContext,
  tgt: FlameTarget,
  val: number,
): void {
  switch (tgt.kind) {
    case 'renderSetting':
      applyRenderSettingTarget(flame, ctx, tgt, val)
      break
    case 'transformAffine':
      applyTransformAffineTarget(flame, ctx, tgt, val)
      break
    case 'transformProperty':
      applyTransformPropertyTarget(flame, ctx, tgt, val)
      break
    case 'variationWeight':
      applyVariationWeightTarget(flame, ctx, tgt, val)
      break
    case 'finalAffine':
      applyFinalAffineTarget(flame, tgt, val)
      break
  }
}

/** One mapping's settled value for one frame. */
export type AudioTargetValue = {
  target: FlameTarget
  value: number
}

/**
 * Settles every mapping for one audio frame, touching no flame at all.
 *
 * Split out of `applyAudioMappingsToFlame` for the live path, which no longer
 * writes the document: it hands these values to a render-time overlay that
 * rebuilds them onto a copy of the authored flame. The envelope state stays
 * here so it advances exactly once per audio frame — an overlay recomputed
 * because the user edited the flame mid-track must not age the envelopes a
 * second time.
 *
 * `changed` is false when every target held still, so the caller can drop the
 * frame instead of publishing one nothing would look different for.
 */
export function resolveAudioMappingValues(
  frameData: FrameData & { isBeat: boolean },
  mappings: AudioMappingEntry[],
  smoothingState?: MappingSmoothingState,
  deltaTime?: number,
): { values: AudioTargetValue[]; changed: boolean } {
  const dt = deltaTime ?? 1 / 30
  const values: AudioTargetValue[] = []
  let changed = false

  for (const mapping of mappings) {
    const raw = getAudioFeatureNormalized(frameData, mapping.audioFeature)
    const clamped = Math.max(0, Math.min(1, raw))
    const targetKey = flameTargetKey(mapping.target)

    const smoothed = computeSmoothedEnvelope(
      clamped,
      targetKey,
      mapping,
      smoothingState,
      dt,
    )
    const settled = settleTargetValue(smoothed, targetKey, smoothingState)
    if (settled.changed) changed = true
    values.push({
      target: mapping.target,
      value: mappingToVal(settled.applied, mapping),
    })
  }

  return { values, changed }
}

/**
 * Writes settled values into a flame — an export's per-frame clone, or the
 * live overlay's copy of the authored flame. Never the open document.
 */
export function applyAudioTargetValues(
  flame: Record<string, unknown>,
  values: readonly AudioTargetValue[],
): void {
  if (values.length === 0) return
  const ctx: AudioMutationContext = {}
  for (const { target, value } of values) {
    dispatchAudioTargetMapping(flame, ctx, target, value)
  }
  if (ctx.rs) {
    if (ctx.camera) ctx.rs.camera = ctx.camera
    flame.renderSettings = ctx.rs
  }
}

/**
 * Settles the mappings for one frame and writes them into `flame`.
 *
 * Targets can be render settings, transform affine coefficients, transform
 * scalar properties, variation weights, or final-transform affine params.
 *
 * Supports attack/release envelope smoothing via optional `attackMs` /
 * `releaseMs` on each mapping entry, and leaves the flame untouched when no
 * mapped value has moved beyond a tiny threshold.
 *
 * For callers that own the flame outright — the two export paths, each with a
 * per-frame clone. The live path settles and applies in two steps instead, so
 * no part of it can reach the open document.
 *
 * @param flame - a flame the caller owns, never the document.
 * @param smoothingState - persistent per-target state (smoothed value, last applied).
 * @param deltaTime - seconds since the previous frame (default 1/30).
 */
export function applyAudioMappingsToFlame(
  flame: Record<string, unknown>,
  frameData: FrameData & { isBeat: boolean },
  mappings: AudioMappingEntry[],
  smoothingState?: MappingSmoothingState,
  deltaTime?: number,
): void {
  if (mappings.length === 0) return
  const { values, changed } = resolveAudioMappingValues(
    frameData,
    mappings,
    smoothingState,
    deltaTime,
  )
  // Nothing moved: leave the flame exactly as it was. The offscreen and
  // main-canvas exports pass no smoothing state, so every frame is a change
  // for them and this only ever short-circuits a live caller.
  if (!changed) return
  applyAudioTargetValues(flame, values)
}
