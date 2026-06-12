import { createMemo, createSignal } from 'solid-js'
import { useTimeline } from '@/contexts/TimelineContext'
import { buildReadableIds } from '@/utils/readableIds'
import { resolveKeyframeValue } from '@/utils/timeline'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

type DebugOverlayProps = {
  animationEnabled: boolean
  flameDescriptor: FlameDescriptor
}

export function DebugOverlay(props: DebugOverlayProps) {
  const timeline = useTimeline()
  const [expanded, setExpanded] = createSignal(false)
  const [panelTop, setPanelTop] = createSignal(window.innerHeight / 2)

  const frame = createMemo(() => timeline?.currentFrame() ?? 0)
  const playing = createMemo(() => timeline?.isPlaying() ?? false)
  const tracks = createMemo(() => timeline?.tracks() ?? [])
  const autoKey = createMemo(() => timeline?.autoKeyframe() ?? false)

  const readable = createMemo(() =>
    buildReadableIds(props.flameDescriptor.transforms),
  )

  const resolvedValues = createMemo(() => {
    const f = frame()
    const trackList = tracks()
    const result: Record<string, unknown> = {}
    for (const track of trackList) {
      const value = resolveKeyframeValue(track.keyframes, f)
      if (value !== null) {
        result[track.parameterPath] = value
      }
    }
    return result
  })

  function handleDragStart(e: PointerEvent) {
    const startY: number = e.clientY
    const startTop: number = panelTop()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    function onMove(ev: PointerEvent) {
      const clientY: number = ev.clientY
      const dy: number = clientY - startY
      setPanelTop(
        Math.max(60, Math.min(window.innerHeight - 60, startTop + dy)),
      )
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const topStyle = () => `${panelTop()}px`

  /** Format a resolved value compactly, truncating arrays/objects to fit one line */
  function formatResolved(value: unknown): string {
    if (value === null || value === undefined) return '(none)'
    if (typeof value === 'number') return value.toFixed(3)
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return `[${(value as number[]).map((v) => v.toFixed(2)).join(',')}]`
    }
    return JSON.stringify(value)
  }

  return (
    <>
      {/* Toggle tab */}
      <button
        onClick={() => setExpanded(!expanded())}
        style={{
          position: 'fixed',
          top: topStyle(),
          right: expanded() ? '340px' : '0',
          transform: 'translateY(-50%)',
          'z-index': '10000',
          background: 'rgba(0,0,0,0.85)',
          color: '#0f0',
          border: 'none',
          'border-radius': '6px 0 0 6px',
          padding: '10px 6px',
          cursor: 'pointer',
          'font-family': 'monospace',
          'font-size': '14px',
          'line-height': '1',
          transition: 'right 0.2s ease',
        }}
        title={expanded() ? 'Hide debug panel' : 'Show debug panel'}
      >
        {expanded() ? '▶' : '◀'}
      </button>

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: topStyle(),
          right: expanded() ? '8px' : '-360px',
          transform: 'translateY(-50%)',
          'z-index': '9999',
          background: 'rgba(0,0,0,0.88)',
          color: '#0f0',
          'border-radius': '8px',
          'font-family': 'monospace',
          'font-size': '11px',
          'line-height': '1.4',
          'max-height': '70vh',
          'overflow-y': 'auto',
          width: '340px',
          'pointer-events': expanded() ? 'auto' : 'none',
          transition: 'right 0.2s ease',
        }}
      >
        {/* Drag handle */}
        <div
          onPointerDown={handleDragStart}
          style={{
            cursor: 'grab',
            padding: '4px 14px',
            'border-bottom': '1px solid rgba(0,255,0,0.2)',
            'margin-bottom': '6px',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'user-select': 'none',
          }}
          title="Drag to move panel up/down"
        >
          <div
            style={{
              width: '24px',
              height: '3px',
              background: 'rgba(0,255,0,0.4)',
              'border-radius': '2px',
            }}
          />
        </div>
        <div
          style={{
            padding: '0 14px 10px',
            'white-space': 'nowrap',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              color: '#ff0',
              'font-weight': 'bold',
              'margin-bottom': '6px',
            }}
          >
            ANIMATION DEBUG
          </div>
          <div>
            Frame: <span style="color:#fff">{frame()}</span>
          </div>
          <div>
            Playing: <span style="color:#fff">{playing() ? 'YES' : 'no'}</span>
          </div>
          <div>
            AutoKey: <span style="color:#fff">{autoKey() ? 'YES' : 'no'}</span>
          </div>
          <div>
            AnimEnabled:{' '}
            <span style="color:#fff">
              {props.animationEnabled ? 'YES' : 'no'}
            </span>
          </div>
          <div style={{ 'margin-top': '4px' }}>
            Camera (flame):{' '}
            <span style="color:#fff">
              zoom=
              {props.flameDescriptor.renderSettings.camera?.zoom?.toFixed(3)} x=
              {props.flameDescriptor.renderSettings.camera?.position[0]?.toFixed(
                3,
              )}{' '}
              y=
              {props.flameDescriptor.renderSettings.camera?.position[1]?.toFixed(
                3,
              )}
            </span>
          </div>
          <div>
            Camera (timeline):{' '}
            <span style="color:#ff0">
              zoom=
              {resolvedValues()['camera.zoom'] !== undefined
                ? (resolvedValues()['camera.zoom'] as number).toFixed(3)
                : '—'}{' '}
              x=
              {resolvedValues()['camera.x'] !== undefined
                ? (resolvedValues()['camera.x'] as number).toFixed(3)
                : '—'}{' '}
              y=
              {resolvedValues()['camera.y'] !== undefined
                ? (resolvedValues()['camera.y'] as number).toFixed(3)
                : '—'}
            </span>
          </div>
          <div>
            Exposure (flame):{' '}
            <span style="color:#fff">
              {props.flameDescriptor.renderSettings.exposure?.toFixed(3)}
            </span>
          </div>
          <div style={{ 'margin-top': '6px', color: '#0af' }}>
            Tracks ({tracks().length}):
          </div>
          {tracks().length === 0 && <div style="color:#666"> (none)</div>}
          {tracks().map((track) => {
            const resolved = resolvedValues()[track.parameterPath]
            return (
              <div style={{ 'margin-left': '4px' }}>
                <span style="color:#0af">
                  {readable().formatTrackPath(track.parameterPath)}
                </span>{' '}
                → kf at:{' '}
                <span style="color:#fff">
                  {track.keyframes.map((kf) => kf.frame).join(', ')}
                </span>{' '}
                resolved:{' '}
                <span style="color:#ff0">{formatResolved(resolved)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
