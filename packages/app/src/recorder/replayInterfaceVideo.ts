import { deepClone } from '@/utils/clone'
import { createMetadataPayload, injectMetadataIntoMp4, } from '@/utils/flameInMp4'
import { createVideoEncoder } from '@/utils/videoEncoder'
import { createReplayVideoSchedule, MAX_REPLAY_VIDEO_DURATION_MS, REPLAY_VIDEO_FPS, REPLAY_VIDEO_LEAD_IN_MS, REPLAY_VIDEO_TAIL_MS, replayVideoInitialTimelineSnapshot, } from './replayVideo'
import { validateSession } from './schema'
import type { RecordedSession } from './schema'
import type { VideoEncoderConfig } from '@/utils/videoEncoder'

/** Full-interface capture keeps the viewport aspect ratio, but caps the long
 * edge and pixel count so a 4K/5K monitor cannot create an unbounded encoder
 * workload. Portrait and landscape views receive the same pixel budget. */
export const MAX_REPLAY_INTERFACE_LONG_EDGE = 1920
export const MAX_REPLAY_INTERFACE_PIXELS = 1920 * 1080

const MAX_CAPTURE_OVERRUN_MS = 5_000

export type ReplayVideoExportMode = 'artwork' | 'interface'

export type ReplayVideoExportRequest =
  | {
      mode: 'artwork'
      session: RecordedSession
      playbackSpeed: number
    }
  | {
      mode: 'interface'
      session: RecordedSession
      playbackSpeed: number
      /** Reset the real workspace/player to the recorded baseline after tab
       * capture is active, so the reset itself is not mistaken for a step. */
      prepareReplay: () => void
      /** Run the ordinary replay player. The capture path observes exactly the
       * DOM, spotlight, captions and flame the viewer sees. */
      playReplay: (signal: AbortSignal) => Promise<void>
    }

export type ReplayInterfaceVideoResult = {
  blob: Blob
  mimeType: string
  extension: 'mp4' | 'webm'
  width: number
  height: number
  frames: number
  embeddedSession: boolean
}

type DisplayCaptureSource = {
  width: number
  height: number
  drawFrame: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void
  onEnded: (listener: () => void) => () => void
  stop: () => void
}

type CaptureEncoder = {
  usedFallback: boolean
  encodeFrame: (bitmap: ImageBitmap, frameIndex: number) => Promise<void>
  finalize: () => Promise<{
    blob: Blob
    mimeType: string
    usedFallback: boolean
  }>
  cancel: () => void
}

type CaptureSurface = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
}

/** Injectable only so the permission/real-time orchestration can be covered
 * without opening a browser picker in unit tests. Production uses the default
 * browser runtime below. */
export type ReplayInterfaceCaptureRuntime = {
  openCapture: (fps: number) => Promise<DisplayCaptureSource>
  createEncoder: (config: VideoEncoderConfig) => Promise<CaptureEncoder>
  createSurface: (width: number, height: number) => CaptureSurface
  createBitmap: (canvas: HTMLCanvasElement) => Promise<ImageBitmap>
  now: () => number
}

type DisplayMediaOptionsWithHints = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean
  selfBrowserSurface?: 'include' | 'exclude'
  surfaceSwitching?: 'include' | 'exclude'
}

function captureError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return new Error(
        'Full-interface recording was cancelled or screen sharing was denied',
      )
    }
    if (error.name === 'InvalidStateError') {
      return new Error(
        'Start full-interface recording directly from the Export button',
      )
    }
  }
  return error instanceof Error
    ? error
    : new Error('Could not capture the interface')
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Full-interface recording was cancelled')
}

function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
      Math.max(0, ms),
    )
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason(signal))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function waitForVideo(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }
    const onReady = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('The shared tab did not provide a video frame'))
    }
    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onError, { once: true })
  })
}

async function openBrowserCapture(fps: number): Promise<DisplayCaptureSource> {
  if (!globalThis.isSecureContext) {
    throw new Error('Full-interface recording requires a secure HTTPS page')
  }
  const mediaDevices = globalThis.navigator?.mediaDevices
  if (!mediaDevices?.getDisplayMedia) {
    throw new Error(
      'This browser does not support recording the full interface',
    )
  }

  let stream: MediaStream
  try {
    // These are hints only: browsers must let the person choose the source.
    // The UI therefore explicitly asks for "This Tab" as well.
    stream = await mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: fps, max: 30 },
        displaySurface: 'browser',
      },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude',
    } as DisplayMediaOptionsWithHints)
  } catch (error) {
    throw captureError(error)
  }

  const track = stream.getVideoTracks()[0]
  if (!track) {
    stream.getTracks().forEach((item) => {
      item.stop()
    })
    throw new Error('The selected share source did not provide video')
  }
  if (track.getSettings().displaySurface === 'monitor') {
    stream.getTracks().forEach((item) => {
      item.stop()
    })
    throw new Error(
      'Choose This Tab or the browser window, not the entire screen',
    )
  }

  const video = document.createElement('video')
  video.autoplay = true
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  let rejectStoppedBeforeReady: ((reason: Error) => void) | undefined
  const stoppedBeforeReady = new Promise<never>((_resolve, reject) => {
    rejectStoppedBeforeReady = reject
  })
  const onStoppedBeforeReady = () => {
    rejectStoppedBeforeReady?.(
      new Error('Screen sharing stopped before capture started'),
    )
  }
  track.addEventListener('ended', onStoppedBeforeReady, { once: true })
  try {
    await Promise.race([waitForVideo(video), stoppedBeforeReady])
    await video.play()
  } catch (error) {
    stream.getTracks().forEach((item) => {
      item.stop()
    })
    video.srcObject = null
    throw captureError(error)
  } finally {
    track.removeEventListener('ended', onStoppedBeforeReady)
  }

  return {
    width: video.videoWidth,
    height: video.videoHeight,
    drawFrame: (context, width, height) => {
      context.drawImage(video, 0, 0, width, height)
    },
    onEnded: (listener) => {
      track.addEventListener('ended', listener)
      return () => {
        track.removeEventListener('ended', listener)
      }
    },
    stop: () => {
      video.pause()
      video.srcObject = null
      stream.getTracks().forEach((item) => {
        item.stop()
      })
    },
  }
}

function browserRuntime(): ReplayInterfaceCaptureRuntime {
  return {
    openCapture: openBrowserCapture,
    createEncoder: createVideoEncoder,
    createSurface: (width, height) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) {
        throw new Error('Could not create the interface capture surface')
      }
      return { canvas, context }
    },
    createBitmap: (canvas) => globalThis.createImageBitmap(canvas),
    now: () => globalThis.performance.now(),
  }
}

export function replayInterfaceCaptureSupported(): boolean {
  return (
    globalThis.isSecureContext &&
    typeof globalThis.navigator?.mediaDevices?.getDisplayMedia === 'function' &&
    ((typeof globalThis.VideoEncoder !== 'undefined' &&
      typeof globalThis.VideoFrame !== 'undefined') ||
      typeof globalThis.MediaRecorder !== 'undefined')
  )
}

export function fitReplayInterfaceVideoDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maxLongEdge = MAX_REPLAY_INTERFACE_LONG_EDGE,
  maxPixels = MAX_REPLAY_INTERFACE_PIXELS,
): { width: number; height: number } {
  if (
    !Number.isFinite(sourceWidth) ||
    !Number.isFinite(sourceHeight) ||
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error('The shared tab reported invalid dimensions')
  }
  const longEdgeScale = maxLongEdge / Math.max(sourceWidth, sourceHeight)
  const pixelScale = Math.sqrt(maxPixels / (sourceWidth * sourceHeight))
  const scale = Math.min(1, longEdgeScale, pixelScale)
  return {
    width: Math.max(2, Math.floor((sourceWidth * scale) / 2) * 2),
    height: Math.max(2, Math.floor((sourceHeight * scale) / 2) * 2),
  }
}

/**
 * Record the actual visible app in real time. Unlike the deterministic artwork
 * renderer, this intentionally uses the browser's screen-capture permission:
 * standard web APIs cannot serialize arbitrary DOM/CSS/WebGPU pixels into an
 * offscreen canvas. Capturing the current tab is what preserves the real
 * sidebar, timeline, spotlight, captions and accumulated flame exactly.
 */
export async function captureReplayInterfaceVideo(
  request: Extract<ReplayVideoExportRequest, { mode: 'interface' }>,
  runtime: ReplayInterfaceCaptureRuntime = browserRuntime(),
): Promise<ReplayInterfaceVideoResult> {
  const session = validateSession(deepClone(request.session))
  if (!session) throw new Error('The recording is not a valid replay session')
  if (session.unnamedWriteCount > 0) {
    throw new Error(
      `This take has ${session.unnamedWriteCount} uncaptured edit${session.unnamedWriteCount === 1 ? '' : 's'}. Record a clean take before publishing it as video.`,
    )
  }
  if (session.actions.length === 0) {
    throw new Error('This take has no authored steps to publish as video.')
  }
  // Validates speed, authored holds and the two-minute resource budget before
  // showing a privacy-sensitive capture chooser.
  createReplayVideoSchedule(session, request.playbackSpeed)

  // This call must remain on the direct Export-button stack. getDisplayMedia
  // requires transient user activation and must prompt on every recording.
  const source = await runtime.openCapture(REPLAY_VIDEO_FPS)
  const { width, height } = fitReplayInterfaceVideoDimensions(
    source.width,
    source.height,
  )
  const surface = runtime.createSurface(width, height)
  let encoder: CaptureEncoder | undefined
  let captureOpen = true
  let completed = false
  let frameIndex = 0
  let samplingError: Error | undefined
  let sampling: Promise<void> | undefined
  const controller = new AbortController()
  const abort = (error: Error) => {
    if (!controller.signal.aborted) controller.abort(error)
  }
  const unsubscribeEnded = source.onEnded(() => {
    if (!completed) {
      abort(new Error('Screen sharing stopped before the replay finished'))
    }
  })
  const timeout = setTimeout(() => {
    abort(new Error('Full-interface recording exceeded the two-minute limit'))
  }, MAX_REPLAY_VIDEO_DURATION_MS + MAX_CAPTURE_OVERRUN_MS)

  try {
    encoder = await runtime.createEncoder({
      codec: 'avc',
      width,
      height,
      fps: REPLAY_VIDEO_FPS,
    })
    const intervalMs = 1000 / REPLAY_VIDEO_FPS
    const captureStartedAt = runtime.now()
    sampling = (async () => {
      try {
        while (captureOpen && !controller.signal.aborted) {
          const deadline = captureStartedAt + frameIndex * intervalMs
          await waitFor(deadline - runtime.now(), controller.signal)
          if (!captureOpen || controller.signal.aborted) break
          source.drawFrame(surface.context, width, height)
          const bitmap = await runtime.createBitmap(surface.canvas)
          if (!captureOpen || controller.signal.aborted) {
            bitmap.close()
            break
          }
          await encoder.encodeFrame(bitmap, frameIndex)
          frameIndex++
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          samplingError = captureError(error)
          abort(samplingError)
        }
      }
    })()

    request.prepareReplay()
    await waitFor(REPLAY_VIDEO_LEAD_IN_MS, controller.signal)
    await request.playReplay(controller.signal)
    await waitFor(REPLAY_VIDEO_TAIL_MS, controller.signal)
    completed = true
    captureOpen = false
    await sampling
    if (samplingError) throw samplingError
    if (controller.signal.aborted) throw abortReason(controller.signal)

    const encoded = await encoder.finalize()
    let blob = encoded.blob
    let embeddedSession = false
    if (!encoded.usedFallback && encoded.mimeType === 'video/mp4') {
      const timeline = replayVideoInitialTimelineSnapshot(session)
      const payload = await createMetadataPayload(
        session.initial,
        timeline.tracks,
        timeline.config,
        session,
      )
      const buffer = await blob.arrayBuffer()
      blob = new Blob([injectMetadataIntoMp4(buffer, payload)], {
        type: 'video/mp4',
      })
      embeddedSession = true
    }

    return {
      blob,
      mimeType: encoded.mimeType,
      extension: encoded.mimeType === 'video/mp4' ? 'mp4' : 'webm',
      width,
      height,
      frames: frameIndex,
      embeddedSession,
    }
  } catch (error) {
    abort(captureError(error))
    captureOpen = false
    await sampling
    encoder?.cancel()
    throw captureError(error)
  } finally {
    completed = true
    captureOpen = false
    clearTimeout(timeout)
    unsubscribeEnded()
    source.stop()
  }
}
