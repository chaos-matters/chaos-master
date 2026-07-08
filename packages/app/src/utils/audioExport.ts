import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { AVC_PROFILE_ORDER, computeReorderDelayUs, createVideoEncoder, frameGridUs, getAvcCodecString, getDefaultBitrate, } from './videoEncoder'
import type { EncodeResult, VideoEncoderConfig } from './videoEncoder'

// --- Audio encoding ---

function isAudioEncoderSupported(): boolean {
  return typeof globalThis.AudioEncoder !== 'undefined'
}

/** AAC-LC — universally supported codec string for WebCodecs AudioEncoder. */
const AAC_CODEC = 'mp4a.40.2'

async function probeAacSupport(config: {
  numberOfChannels: number
  sampleRate: number
}): Promise<boolean> {
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: AAC_CODEC,
      numberOfChannels: config.numberOfChannels,
      sampleRate: config.sampleRate,
      bitrate: 128_000,
    })
    return support.supported ?? false
  } catch {
    return false
  }
}

// --- Combined A/V pipeline ---

function createAudioVideoPipeline(
  videoConfig: VideoEncoderConfig,
  audioBuffer: AudioBuffer,
  fps: number,
  videoCodecString: string,
): {
  encode: (frame: VideoFrame, frameIndex: number) => Promise<void>
  finalize: () => Promise<EncodeResult>
  cancel: () => void
} {
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: {
      codec: videoConfig.codec,
      width: videoConfig.width,
      height: videoConfig.height,
    },
    audio: {
      codec: 'aac',
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  let videoEncoder: VideoEncoder | undefined
  let audioEncoder: AudioEncoder | undefined
  let cancelled = false
  let asyncError: Error | undefined
  let videoConfigured = false
  let audioConfigured = false
  let framesEncoded = 0

  type PendingVideoChunk = {
    data: Uint8Array
    type: EncodedVideoChunkType
    ptsUs: number
    meta: EncodedVideoChunkMetadata | undefined
  }
  const pendingVideoChunks: PendingVideoChunk[] = []

  let audioEncodeDone = false

  const bitrate =
    videoConfig.bitrate ??
    getDefaultBitrate(videoConfig.width, videoConfig.height, fps)
  const keyFrameInterval = Math.max(1, Math.round(fps * 2))

  // --- Video encoder ---
  const initVideoEncoder = () => {
    if (videoConfigured) return
    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (cancelled) return
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        pendingVideoChunks.push({
          data,
          type: chunk.type,
          ptsUs: chunk.timestamp,
          meta,
        })
      },
      error: (e) => {
        console.error('VideoEncoder error:', e)
        cancelled = true
        asyncError = e instanceof Error ? e : new Error(String(e))
        try {
          videoEncoder?.close()
        } catch {
          /* already closed */
        }
      },
    })
    videoEncoder.configure({
      codec: videoCodecString,
      width: videoConfig.width,
      height: videoConfig.height,
      bitrate,
      framerate: fps,
      ...(videoCodecString.startsWith('avc1')
        ? { avc: { format: 'avc' as const } }
        : {}),
    })
    videoConfigured = true
  }

  // --- Audio encoder ---
  const initAudioEncoder = () => {
    if (audioConfigured) return
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (cancelled) return
        muxer.addAudioChunk(chunk, meta)
      },
      error: (e) => {
        console.error('AudioEncoder error:', e)
        cancelled = true
        asyncError = e instanceof Error ? e : new Error(String(e))
        try {
          audioEncoder?.close()
        } catch {
          /* already closed */
        }
      },
    })
    audioEncoder.configure({
      codec: AAC_CODEC,
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: 128_000,
    })
    audioConfigured = true
  }

  const encodeAllAudio = () => {
    if (audioEncodeDone) return
    initAudioEncoder()

    // Construct AudioData from AudioBuffer.
    // TS discriminated union on AudioDataInit format is hard to satisfy through a
    // conditional — the branches unify instead of narrowing. Build with assertion.
    const audioDataInit = {
      format: (audioBuffer.numberOfChannels === 1
        ? 'f32'
        : 'f32-planar') as AudioDataInit['format'],
      sampleRate: audioBuffer.sampleRate,
      numberOfFrames: audioBuffer.length,
      numberOfChannels: audioBuffer.numberOfChannels,
      timestamp: 0,
      data:
        audioBuffer.numberOfChannels === 1
          ? audioBuffer.getChannelData(0)
          : Array.from({ length: audioBuffer.numberOfChannels }, (_, i) =>
              audioBuffer.getChannelData(i),
            ),
    }
    const audioData = new AudioData(audioDataInit as AudioDataInit)

    audioEncoder!.encode(audioData)
    audioData.close()

    // Flush the audio encoder — output callbacks fire synchronously during flush,
    // adding chunks directly to the muxer.
    audioEncoder!.flush().catch((e: unknown) => {
      console.error('AudioEncoder flush error:', e)
    })
    audioEncodeDone = true
  }

  // Start audio encoding immediately — chunks go straight to muxer.
  encodeAllAudio()

  // Bound encoder queue like videoEncoder.ts
  const MAX_ENCODE_QUEUE = 4

  const waitForQueueDrain = async () => {
    while (
      !cancelled &&
      videoEncoder !== undefined &&
      videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE
    ) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          resolve()
        }, 50)
        videoEncoder?.addEventListener(
          'dequeue',
          () => {
            clearTimeout(timer)
            resolve()
          },
          { once: true },
        )
      })
    }
  }

  const encode = async (frame: VideoFrame, frameIndex: number) => {
    if (cancelled) {
      if (asyncError) throw asyncError
      return
    }
    initVideoEncoder()
    await waitForQueueDrain()
    if (cancelled) {
      if (asyncError) throw asyncError
      return
    }
    const keyFrame = frameIndex === 0 || frameIndex % keyFrameInterval === 0
    try {
      videoEncoder!.encode(frame, { keyFrame })
      framesEncoded++
    } catch (e) {
      console.error('VideoEncoder encode error:', e)
      cancelled = true
      try {
        videoEncoder?.close()
      } catch {
        /* already closed */
      }
    }
  }

  const finalize = async (): Promise<EncodeResult> => {
    if (asyncError) throw asyncError
    if (cancelled && framesEncoded === 0) {
      throw new Error('VideoEncoder failed before encoding any frames')
    }
    try {
      // Flush video encoder to get any remaining chunks
      if (!cancelled && videoEncoder) {
        await videoEncoder.flush()
      }

      // Add video chunks with PTS/DTS reorder delay (same logic as videoEncoder.ts)
      const frameDurationUs = Math.round(1e6 / fps)
      const reorderDelayUs = computeReorderDelayUs(
        pendingVideoChunks.map((c) => c.ptsUs),
        fps,
      )
      for (let d = 0; d < pendingVideoChunks.length; d++) {
        const chunk = pendingVideoChunks[d]!
        const dtsUs = frameGridUs(d, fps)
        const ptsUs = chunk.ptsUs + reorderDelayUs
        muxer.addVideoChunkRaw(
          chunk.data,
          chunk.type,
          ptsUs,
          frameDurationUs,
          chunk.meta,
          ptsUs - dtsUs,
        )
      }
      pendingVideoChunks.length = 0

      // Audio chunks are already muxed (added directly in AudioEncoder output callback).
      muxer.finalize()
      return {
        blob: new Blob([target.buffer], { type: 'video/mp4' }),
        mimeType: 'video/mp4',
        usedFallback: false,
      }
    } finally {
      if (!cancelled && videoEncoder) {
        videoEncoder.close()
      }
      if (audioEncoder) {
        try {
          audioEncoder.close()
        } catch {
          /* already closed */
        }
      }
    }
  }

  const cancel = () => {
    cancelled = true
    pendingVideoChunks.length = 0
    try {
      videoEncoder?.close()
    } catch {
      /* already closed */
    }
    try {
      audioEncoder?.close()
    } catch {
      /* already closed */
    }
  }

  return { encode, finalize, cancel }
}

// --- Public API ---

export async function createAudioVideoEncoder(
  videoConfig: VideoEncoderConfig,
  audioBuffer: AudioBuffer,
  fps: number,
): Promise<{
  encodeFrame: (bitmap: ImageBitmap, frameIndex: number) => Promise<void>
  finalize: () => Promise<EncodeResult>
  cancel: () => void
  usedFallback: boolean
  codec: VideoEncoderConfig['codec']
}> {
  const webCodecsSupported =
    typeof globalThis.VideoEncoder !== 'undefined' &&
    typeof globalThis.VideoFrame !== 'undefined'

  const audioSupported =
    isAudioEncoderSupported() &&
    (await probeAacSupport({
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
    }))

  if (!webCodecsSupported || !audioSupported) {
    console.warn(
      `[audioExport] ${!webCodecsSupported ? 'WebCodecs' : 'AudioEncoder/AAC'} not supported, falling back to video-only`,
    )
    const videoEncoder = await createVideoEncoder(videoConfig)
    return { ...videoEncoder, usedFallback: true }
  }

  // Probe video codec (same strategy as videoEncoder.ts)
  const codecOrder: VideoEncoderConfig['codec'][] = [
    videoConfig.codec,
    ...(['avc', 'vp9', 'hevc'] as const).filter((c) => c !== videoConfig.codec),
  ]
  const candidates: {
    codec: VideoEncoderConfig['codec']
    codecString: string
  }[] = []
  for (const codec of codecOrder) {
    if (codec === 'avc') {
      for (const profile of AVC_PROFILE_ORDER) {
        candidates.push({
          codec,
          codecString: getAvcCodecString(
            videoConfig.width,
            videoConfig.height,
            profile,
          ),
        })
      }
    } else if (codec === 'hevc') {
      candidates.push({ codec, codecString: 'hvc1.1.6.L93.B0' })
    } else {
      candidates.push({ codec, codecString: 'vp09.00.10.08' })
    }
  }

  let selected = candidates[0]!
  let probeSucceeded = false
  for (const candidate of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: candidate.codecString,
        width: videoConfig.width,
        height: videoConfig.height,
        bitrate:
          videoConfig.bitrate ??
          getDefaultBitrate(videoConfig.width, videoConfig.height, fps),
        framerate: fps,
        ...(candidate.codecString.startsWith('avc1')
          ? { avc: { format: 'avc' as const } }
          : {}),
      })
      if (support.supported ?? false) {
        selected = candidate
        probeSucceeded = true
        break
      }
    } catch {
      // try next
    }
  }

  if (!probeSucceeded) {
    console.warn(
      `[audioExport] no video codec config reported support, trying ${selected.codecString} anyway`,
    )
  }

  const pipeline = createAudioVideoPipeline(
    { ...videoConfig, codec: selected.codec, bitrate: videoConfig.bitrate },
    audioBuffer,
    fps,
    selected.codecString,
  )

  return {
    usedFallback: false,
    codec: selected.codec,
    encodeFrame: async (bitmap, frameIndex) => {
      const duration = Math.round(1e6 / fps)
      const timestamp = Math.round((frameIndex * 1e6) / fps)
      const frame = new VideoFrame(bitmap, { timestamp, duration })
      try {
        await pipeline.encode(frame, frameIndex)
      } finally {
        frame.close()
        bitmap.close()
      }
    },
    finalize: pipeline.finalize,
    cancel: pipeline.cancel,
  }
}
