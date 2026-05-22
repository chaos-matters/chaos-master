import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

export type VideoEncoderConfig = {
  codec: 'avc' | 'hevc' | 'vp9'
  width: number
  height: number
  fps: number
  bitrate?: number
}

export type EncodeResult = {
  blob: Blob
  mimeType: string
  usedFallback: boolean
}

function getAvcCodecString(width: number, height: number): string {
  // Macroblock-aligned coded area determines the required AVC level.
  // Each macroblock is 16x16, so coded dimensions are ceil(w/16)*16.
  const codedWidth = Math.ceil(width / 16) * 16
  const codedHeight = Math.ceil(height / 16) * 16
  const codedArea = codedWidth * codedHeight

  // AVC levels and their MaxFS (max frame size in macroblocks = pixels/256):
  //   3.1:  3,600 MBs =   921,600 px
  //   4.0:  8,192 MBs = 2,097,152 px
  //   4.2:  8,704 MBs = 2,228,224 px
  //   5.0: 22,080 MBs = 5,652,480 px
  //   5.1: 36,864 MBs = 9,437,184 px
  if (codedArea <= 921600) return 'avc1.64001f' // Level 3.1
  if (codedArea <= 2097152) return 'avc1.640028' // Level 4.0
  if (codedArea <= 2228224) return 'avc1.64002A' // Level 4.2
  if (codedArea <= 5652480) return 'avc1.640032' // Level 5.0
  return 'avc1.640033' // Level 5.1 (max 9,437,184 px)
}

function getCodecString(
  codec: VideoEncoderConfig['codec'],
  width: number,
  height: number,
): string {
  if (codec === 'avc') return getAvcCodecString(width, height)
  if (codec === 'hevc') return 'hvc1.1.6.L93.B0'
  return 'vp09.00.10.08'
}

let webCodecsSupported: boolean | undefined

function isWebCodecsSupported(): boolean {
  if (webCodecsSupported !== undefined) return webCodecsSupported
  webCodecsSupported =
    typeof globalThis.VideoEncoder !== 'undefined' &&
    typeof globalThis.VideoFrame !== 'undefined'
  return webCodecsSupported
}

function createWebCodecsPipeline(config: VideoEncoderConfig): {
  encode: (frame: VideoFrame, frameIndex: number) => void
  finalize: () => Promise<EncodeResult>
  cancel: () => void
} {
  const target = new ArrayBufferTarget()
  const muxer = new Muxer({
    target,
    video: { codec: config.codec, width: config.width, height: config.height },
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  })

  let encoder: VideoEncoder | undefined
  let cancelled = false
  let configured = false
  let framesEncoded = 0

  const initEncoder = () => {
    if (configured) return
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        if (cancelled) return
        muxer.addVideoChunk(chunk, meta)
      },
      error: (e) => {
        console.error('VideoEncoder error:', e)
        cancelled = true
        try {
          encoder?.close()
        } catch {
          /* already closed */
        }
      },
    })
    encoder.configure({
      codec: getCodecString(config.codec, config.width, config.height),
      width: config.width,
      height: config.height,
      bitrate: config.bitrate ?? 8_000_000,
      framerate: config.fps,
    })
    configured = true
  }

  const encode = (frame: VideoFrame, frameIndex: number) => {
    if (cancelled) return
    initEncoder()
    const keyFrame = frameIndex === 0 || frameIndex % 30 === 0
    try {
      encoder!.encode(frame, { keyFrame })
      framesEncoded++
    } catch (e) {
      console.error('VideoEncoder encode error:', e)
      cancelled = true
      try {
        encoder?.close()
      } catch {
        /* already closed */
      }
    }
  }

  const finalize = async (): Promise<EncodeResult> => {
    if (cancelled && framesEncoded === 0) {
      throw new Error('VideoEncoder failed before encoding any frames')
    }
    try {
      if (!cancelled && encoder) {
        await encoder.flush()
      }
      muxer.finalize()
      return {
        blob: new Blob([target.buffer], { type: 'video/mp4' }),
        mimeType: 'video/mp4',
        usedFallback: false,
      }
    } finally {
      if (!cancelled && encoder) {
        encoder.close()
      }
    }
  }

  const cancel = () => {
    cancelled = true
    try {
      encoder?.close()
    } catch {
      /* already closed */
    }
  }

  return { encode, finalize, cancel }
}

function createMediaRecorderFallback(
  width: number,
  height: number,
  fps: number,
): {
  encode: (bitmap: ImageBitmap) => void
  finalize: () => Promise<EncodeResult>
  cancel: () => void
} {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const mimeTypes = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  let selectedMimeType = ''
  for (const mt of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mt)) {
      selectedMimeType = mt
      break
    }
  }

  const stream = canvas.captureStream(fps)
  const chunks: Blob[] = []
  const recorder = new MediaRecorder(stream, {
    mimeType: selectedMimeType || undefined,
  })

  let cancelled = false

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  const finalizePromise = new Promise<EncodeResult>((resolve) => {
    recorder.onstop = () => {
      const mimeType = selectedMimeType || 'video/webm'
      resolve({
        blob: new Blob(chunks, { type: mimeType }),
        mimeType,
        usedFallback: true,
      })
    }
  })

  recorder.start()

  const encode = (bitmap: ImageBitmap) => {
    if (cancelled) return
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
  }

  const finalize = async (): Promise<EncodeResult> => {
    if (cancelled)
      return { blob: new Blob(), mimeType: 'video/webm', usedFallback: true }
    if (recorder.state === 'recording') {
      recorder.stop()
    }
    return finalizePromise
  }

  const cancel = () => {
    cancelled = true
    if (recorder.state === 'recording') recorder.stop()
  }

  return { encode, finalize, cancel }
}

export async function createVideoEncoder(config: VideoEncoderConfig): Promise<{
  encodeFrame: (bitmap: ImageBitmap, frameIndex: number) => void
  finalize: () => Promise<EncodeResult>
  cancel: () => void
  usedFallback: boolean
  codec: VideoEncoderConfig['codec']
}> {
  if (isWebCodecsSupported()) {
    // Verify the preferred codec is actually supported for encoding.
    let codec = config.codec
    const supported = await VideoEncoder.isConfigSupported({
      codec: getCodecString(codec, config.width, config.height),
      width: config.width,
      height: config.height,
      bitrate: config.bitrate ?? 8_000_000,
      framerate: config.fps,
    })
    if (!(supported.supported ?? false)) {
      // Fall back to next supported codec.
      const fallbackOrder: VideoEncoderConfig['codec'][] = [
        'avc',
        'vp9',
        'hevc',
      ]
      let found: VideoEncoderConfig['codec'] | null = null
      for (const fb of fallbackOrder) {
        if (fb === codec) continue
        const fbSupported = await VideoEncoder.isConfigSupported({
          codec: getCodecString(fb, config.width, config.height),
          width: config.width,
          height: config.height,
          bitrate: config.bitrate ?? 8_000_000,
          framerate: config.fps,
        })
        if (fbSupported.supported ?? false) {
          found = fb
          break
        }
      }
      if (found) {
        console.warn(
          `[videoEncoder] ${codec} not supported, falling back to ${found}`,
        )
        codec = found
      }
      // If no codec is supported, let the WebCodecs pipeline fail naturally.
    }

    const pipeline = createWebCodecsPipeline({ ...config, codec })

    return {
      usedFallback: false,
      codec,
      encodeFrame: (bitmap, frameIndex) => {
        const duration = 1e6 / config.fps
        const timestamp = frameIndex * duration
        const frame = new VideoFrame(bitmap, { timestamp, duration })
        pipeline.encode(frame, frameIndex)
        frame.close()
      },
      finalize: pipeline.finalize,
      cancel: pipeline.cancel,
    }
  }

  const fallback = createMediaRecorderFallback(
    config.width,
    config.height,
    config.fps,
  )

  return {
    usedFallback: true,
    codec: config.codec,
    encodeFrame: (bitmap, _frameIndex) => {
      fallback.encode(bitmap)
    },
    finalize: fallback.finalize,
    cancel: fallback.cancel,
  }
}

export function detectCodec(): {
  codec: VideoEncoderConfig['codec']
  method: 'webcodecs' | 'mediaRecorder'
} {
  return {
    codec: 'avc',
    method: isWebCodecsSupported() ? 'webcodecs' : 'mediaRecorder',
  }
}
