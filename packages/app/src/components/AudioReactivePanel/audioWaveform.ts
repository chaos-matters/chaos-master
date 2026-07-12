import type { AudioAnalyzer } from '@/utils/audioAnalysis'

export function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const mono = new Float32Array(length)
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < length; i++) {
      mono[i]! += data[i]!
    }
  }
  for (let i = 0; i < length; i++) {
    mono[i] = mono[i]! / buffer.numberOfChannels
  }
  return mono
}

export async function computeBeatFrames(
  analyzer: AudioAnalyzer,
  onProgress?: (current: number, total: number) => void,
): Promise<{ beatFrames: Set<number>; totalFrames: number }> {
  const beats = new Set<number>()
  const CHUNK = 100
  return new Promise((resolve) => {
    let i = 0

    function processChunk() {
      const end = Math.min(i + CHUNK, analyzer.totalFrames)
      for (; i < end; i++) {
        if (analyzer.getFrameData(i).isBeat) beats.add(i)
      }
      onProgress?.(end - 1, analyzer.totalFrames)
      if (i < analyzer.totalFrames) {
        setTimeout(processChunk, 0)
      } else {
        resolve({ beatFrames: beats, totalFrames: analyzer.totalFrames })
      }
    }
    processChunk()
  })
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  audioBuffer: AudioBuffer,
  beats: Set<number>,
  totalFrames: number,
  playheadX?: number,
): void {
  const ctx = canvas.getContext('2d')!
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  // Pre-compute downsampled peaks
  const mono = mixToMono(audioBuffer)
  const peaks = new Float32Array(width)
  const step = Math.ceil(mono.length / width)
  for (let x = 0; x < width; x++) {
    const start = x * step
    const end = Math.min(start + step, mono.length)
    let peak = 0
    for (let i = start; i < end; i++) {
      const abs = Math.abs(mono[i]!)
      if (abs > peak) peak = abs
    }
    peaks[x] = peak
  }

  // Waveform fill
  const midY = height / 2
  ctx.beginPath()
  for (let x = 0; x < width; x++) {
    const y = peaks[x]! * midY
    ctx.moveTo(x, midY - y)
    ctx.lineTo(x, midY + y)
  }
  ctx.strokeStyle = 'rgba(180, 160, 255, 0.75)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Beat markers — subtle ticks at top and bottom
  if (totalFrames > 0 && beats.size > 0) {
    const tickH = 5
    ctx.strokeStyle = 'rgba(255, 150, 110, 0.28)'
    ctx.lineWidth = 1
    for (const frame of beats) {
      const x = (frame / totalFrames) * width
      // Top tick
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, tickH)
      ctx.stroke()
      // Bottom tick
      ctx.beginPath()
      ctx.moveTo(x, height - tickH)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
  }

  // Playhead line
  if (playheadX !== undefined && playheadX >= 0 && playheadX <= width) {
    ctx.beginPath()
    ctx.moveTo(playheadX, 0)
    ctx.lineTo(playheadX, height)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
}
