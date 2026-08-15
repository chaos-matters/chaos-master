import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { TimelineContextProvider } from '@/contexts/TimelineContext'
import { createTimelineState } from '@/utils/timeline'
import { CurveEditor } from './CurveEditor/CurveEditor'
import { DopeSheetTrack } from './DopeSheetTrack'
import { KeyframeInspector } from './KeyframeInspector'
import { TimelineSettings } from './TimelineSettings'

function installPointerCapture(target: Element) {
  const captured = new Set<number>()
  Object.defineProperties(target, {
    setPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => captured.add(pointerId)),
    },
    hasPointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => captured.has(pointerId)),
    },
    releasePointerCapture: {
      configurable: true,
      value: vi.fn((pointerId: number) => captured.delete(pointerId)),
    },
  })
}

function keyframeValue(
  timeline: ReturnType<typeof createTimelineState>,
  path: string,
  frame: number,
) {
  return timeline.getKeyframeAtFrame(path, frame)?.value
}

describe('timeline pointer gesture ownership', () => {
  it('keeps a curve drag bound to the pointer that started it', () => {
    const timeline = createTimelineState()
    timeline.loadTracks([
      {
        parameterPath: 'renderSettings.exposure',
        keyframes: [{ frame: 10, value: 1, easing: 'linear' }],
      },
    ])
    const breakUndoCoalescing = vi.spyOn(timeline, 'breakUndoCoalescing')
    const { unmount } = render(() => (
      <TimelineContextProvider value={timeline}>
        <CurveEditor
          path="renderSettings.exposure"
          frameWidth={10}
          startFrame={0}
          endFrame={100}
          trackNameWidth={100}
          scrollLeft={0}
        />
      </TimelineContextProvider>
    ))
    const node = document.querySelector('circle.node')
    if (!node) throw new Error('missing curve node')
    installPointerCapture(node)

    fireEvent.pointerDown(node, {
      pointerId: 7,
      button: 0,
      clientX: 100,
      clientY: 20,
    })
    fireEvent.pointerMove(window, {
      pointerId: 8,
      clientX: 150,
      clientY: 40,
    })
    fireEvent.pointerUp(window, { pointerId: 8 })
    expect(keyframeValue(timeline, 'renderSettings.exposure', 10)).toBe(1)
    expect(breakUndoCoalescing).toHaveBeenCalledOnce()

    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 100,
      clientY: 30,
    })
    const draggedValue = keyframeValue(timeline, 'renderSettings.exposure', 10)
    expect(draggedValue).not.toBe(1)
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(breakUndoCoalescing).toHaveBeenCalledTimes(2)
    fireEvent.pointerMove(window, {
      pointerId: 7,
      clientX: 100,
      clientY: 60,
    })
    expect(keyframeValue(timeline, 'renderSettings.exposure', 10)).toBe(
      draggedValue,
    )

    unmount()
  })

  it('keeps the keyframe inspector scrub alive across unrelated pointerup', () => {
    const timeline = createTimelineState()
    timeline.loadTracks([
      {
        parameterPath: 'renderSettings.exposure',
        keyframes: [{ frame: 10, value: 1, easing: 'linear' }],
      },
    ])
    const breakUndoCoalescing = vi.spyOn(timeline, 'breakUndoCoalescing')
    const { unmount } = render(() => (
      <TimelineContextProvider value={timeline}>
        <KeyframeInspector
          selectedKeyframe={{
            path: 'renderSettings.exposure',
            frame: 10,
          }}
        />
      </TimelineContextProvider>
    ))
    const value = screen.getByTitle('Drag to adjust, double-click to edit')
    installPointerCapture(value)

    fireEvent.pointerDown(value, {
      pointerId: 7,
      button: 0,
      clientX: 100,
    })
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 200 })
    fireEvent.pointerUp(window, { pointerId: 8 })
    expect(keyframeValue(timeline, 'renderSettings.exposure', 10)).toBe(1)
    expect(breakUndoCoalescing).toHaveBeenCalledOnce()

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 110 })
    expect(keyframeValue(timeline, 'renderSettings.exposure', 10)).toBe(1.1)
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(breakUndoCoalescing).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('keeps timeline setting scrubs isolated to their initiating pointer', () => {
    const timeline = createTimelineState()
    const breakUndoCoalescing = vi.spyOn(timeline, 'breakUndoCoalescing')
    const { unmount } = render(() => (
      <TimelineContextProvider value={timeline}>
        <TimelineSettings />
      </TimelineContextProvider>
    ))
    const fpsLabel = screen.getByText('FPS').closest('label')
    if (!fpsLabel) throw new Error('missing FPS scrubber')
    installPointerCapture(fpsLabel)
    const initialFps = timeline.config().fps

    fireEvent.pointerDown(fpsLabel, {
      pointerId: 7,
      button: 0,
      clientX: 100,
    })
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 200 })
    fireEvent.pointerUp(window, { pointerId: 8 })
    expect(timeline.config().fps).toBe(initialFps)
    expect(breakUndoCoalescing).not.toHaveBeenCalled()

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 120 })
    expect(timeline.config().fps).toBe(initialFps + 4)
    fireEvent.pointerUp(window, { pointerId: 7 })
    expect(breakUndoCoalescing).toHaveBeenCalledOnce()

    unmount()
  })

  it('does not finish a dope-sheet drag with another pointer', () => {
    const timeline = createTimelineState()
    timeline.loadTracks([
      {
        parameterPath: 'renderSettings.exposure',
        keyframes: [{ frame: 10, value: 1, easing: 'linear' }],
      },
    ])
    const onDragKeyframe = vi.fn()
    const { unmount } = render(() => (
      <TimelineContextProvider value={timeline}>
        <DopeSheetTrack
          parameterPath="renderSettings.exposure"
          label="Exposure"
          trackNameWidth={100}
          frameWidth={10}
          trackHeight={20}
          startFrame={0}
          endFrame={100}
          currentFrame={0}
          selectedKeyframe={null}
          onSelectKeyframe={() => {}}
          onSelectTrack={() => {}}
          onDragKeyframe={onDragKeyframe}
          onContextMenu={() => {}}
        />
      </TimelineContextProvider>
    ))
    const diamond = document.querySelector('.keyframeDot')
    const lane = document.querySelector('.lane')
    if (!diamond || !lane) throw new Error('missing dope-sheet keyframe')
    installPointerCapture(diamond)
    vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      right: 1000,
      bottom: 20,
      left: 0,
      width: 1000,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(diamond, {
      pointerId: 7,
      button: 0,
      clientX: 100,
    })
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 200 })
    fireEvent.pointerUp(window, { pointerId: 8, clientX: 200 })
    expect(onDragKeyframe).not.toHaveBeenCalled()

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 200 })
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 200 })
    expect(onDragKeyframe).toHaveBeenCalledOnce()
    expect(onDragKeyframe).toHaveBeenCalledWith(
      'renderSettings.exposure',
      10,
      20,
    )

    unmount()
  })
})
