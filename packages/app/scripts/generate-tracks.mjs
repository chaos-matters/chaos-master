import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.resolve(__dirname, '../public/audio')

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

/**
 * Creates a valid RIFF 16-bit mono PCM WAV buffer from floating-point samples [-1, 1].
 */
function createWavBuffer(samples, sampleRate = 44100) {
  const numSamples = samples.length
  const bytesPerSample = 2
  const blockAlign = bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * bytesPerSample
  const buffer = Buffer.alloc(44 + dataSize)

  // RIFF header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)

  // fmt subchunk
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20) // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(1, 22) // NumChannels (1 = mono)
  buffer.writeUInt32LE(sampleRate, 24) // SampleRate
  buffer.writeUInt32LE(byteRate, 28) // ByteRate
  buffer.writeUInt16LE(blockAlign, 32) // BlockAlign
  buffer.writeUInt16LE(16, 34) // BitsPerSample

  // data subchunk
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    const val = s < 0 ? s * 0x8000 : s * 0x7fff
    buffer.writeInt16LE(Math.floor(val), 44 + i * 2)
  }

  return buffer
}

/**
 * Synthesizes "Ember Drift" (100 BPM, D minor ambient pad + deep sub pulse).
 * Duration: 12 seconds (5 bars at 100 BPM).
 */
function generateEmberDrift(sampleRate = 44100) {
  const bpm = 100
  const durationSec = 12
  const numSamples = Math.floor(sampleRate * durationSec)
  const samples = new Float32Array(numSamples)
  const beatDuration = 60 / bpm

  // Chord progression: Dm (D3, F3, A3) -> Bb (Bb2, D3, F3) -> C (C3, E3, G3) -> Dm
  const chordRoots = [146.83, 116.54, 130.81, 146.83] // D3, Bb2, C3, D3

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const bar = Math.floor(t / (beatDuration * 4)) % chordRoots.length
    const root = chordRoots[bar]

    // Warm pad chords (root, minor/major third, fifth)
    const third = bar === 1 || bar === 2 ? root * 1.2599 : root * 1.1892
    const fifth = root * 1.4983

    const pad =
      0.22 * Math.sin(2 * Math.PI * root * t) +
      0.15 * Math.sin(2 * Math.PI * third * t) +
      0.12 * Math.sin(2 * Math.PI * fifth * t) +
      0.08 * Math.sin(4 * Math.PI * root * t)

    // Deep sub-bass pulse on each beat
    const beatPhase = (t % beatDuration) / beatDuration
    const subFreq = root / 2 // Sub-octave
    const subEnvelope = Math.exp(-beatPhase * 4.5)
    const sub = 0.35 * Math.sin(2 * Math.PI * subFreq * t) * subEnvelope

    // Gentle high-frequency harmonic shimmer
    const shimmerPhase = Math.sin(2 * Math.PI * 0.25 * t)
    const shimmer =
      0.04 * Math.sin(2 * Math.PI * root * 4 * t) * (0.5 + 0.5 * shimmerPhase)

    // Smooth overall fade-in and fade-out envelope
    const envIn = Math.min(1, t / 0.5)
    const envOut = Math.min(1, (durationSec - t) / 0.5)
    const masterEnv = envIn * envOut

    samples[i] = (pad + sub + shimmer) * masterEnv
  }

  return samples
}

/**
 * Synthesizes "Cyber Pulse" (120 BPM, punchy electronic kick, bass arpeggio, noise sweep).
 * Duration: 10 seconds (5 bars at 120 BPM).
 */
function generateCyberPulse(sampleRate = 44100) {
  const bpm = 120
  const durationSec = 10
  const numSamples = Math.floor(sampleRate * durationSec)
  const samples = new Float32Array(numSamples)
  const beatDuration = 60 / bpm

  // Bass notes (A minor scale): A1 (55Hz), C2 (65.4Hz), E2 (82.4Hz), G2 (98Hz)
  const arpNotes = [55.0, 65.41, 82.41, 98.0, 110.0, 82.41, 65.41, 55.0]

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const beatPhase = (t % beatDuration) / beatDuration

    // Punchy electronic kick on every beat (fast pitch drop from 150Hz to 45Hz)
    const kickFreq = 45 + 105 * Math.exp(-beatPhase * 25)
    const kickEnv = Math.exp(-beatPhase * 6)
    const kick =
      0.45 *
      Math.sin(2 * Math.PI * kickFreq * beatPhase * beatDuration) *
      kickEnv

    // 16th-note bass synth arpeggio (4 steps per beat)
    const stepDuration = beatDuration / 4
    const stepIdx = Math.floor(t / stepDuration) % arpNotes.length
    const stepPhase = (t % stepDuration) / stepDuration
    const noteFreq = arpNotes[stepIdx]
    const arpEnv = Math.exp(-stepPhase * 8)
    const arp =
      0.25 *
      (Math.sin(2 * Math.PI * noteFreq * t) +
        0.5 * Math.sin(4 * Math.PI * noteFreq * t)) *
      arpEnv

    // Filtered noise hi-hat on the off-beat (8th-notes)
    const eighthPhase = (t % (beatDuration / 2)) / (beatDuration / 2)
    const isOffbeat = Math.floor(t / (beatDuration / 2)) % 2 === 1
    const hatEnv = isOffbeat ? Math.exp(-eighthPhase * 18) : 0
    const noise = (Math.random() * 2 - 1) * 0.08 * hatEnv

    // Master envelope (fade in / out)
    const envIn = Math.min(1, t / 0.3)
    const envOut = Math.min(1, (durationSec - t) / 0.3)
    const masterEnv = envIn * envOut

    samples[i] = (kick + arp + noise) * masterEnv
  }

  return samples
}

console.log('Synthesizing bundled CC0 audio tracks...')

const emberSamples = generateEmberDrift()
const emberBuffer = createWavBuffer(emberSamples)
fs.writeFileSync(path.join(outDir, 'ember-drift.wav'), emberBuffer)
console.log('Created packages/app/public/audio/ember-drift.wav')

const cyberSamples = generateCyberPulse()
const cyberBuffer = createWavBuffer(cyberSamples)
fs.writeFileSync(path.join(outDir, 'cyber-pulse.wav'), cyberBuffer)
console.log('Created packages/app/public/audio/cyber-pulse.wav')

const manifest = [
  {
    id: 'ember-drift',
    name: 'Ember Drift',
    artist: 'Lumen Studio (CC0)',
    bpm: 100,
    duration: 12,
    url: '/audio/ember-drift.wav',
    description:
      'Warm ambient synth chords with deep sub-bass pulse at 100 BPM.',
  },
  {
    id: 'cyber-pulse',
    name: 'Cyber Pulse',
    artist: 'Lumen Studio (CC0)',
    bpm: 120,
    duration: 10,
    url: '/audio/cyber-pulse.wav',
    description:
      'Driving electronic rhythm with punchy bass arpeggio at 120 BPM.',
  },
]

fs.writeFileSync(
  path.join(outDir, 'tracks.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log('Created packages/app/public/audio/tracks.json')
console.log('Finished generating bundled tracks successfully.')
