import { batch, createSignal, For, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_QUALITY, IS_DEV } from '@/defaults'
import { examples } from '@/flame/examples'
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { Flam3 } from '@/flame/Flam3'
import { Cross } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { deleteRecentFlame, loadRecentFlames } from '@/utils/recentFlames'
import { recordEntries } from '@/utils/record'
import { applyTimelineToFlame } from '@/utils/timeline'
import { Button } from '../Button/Button'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './LoadFlameModal.module.css'
import type { AnimationDef } from '@/flame/examples/animations'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

const { performance } = globalThis

const CANCEL = 'cancel'

type AnimationLoad = { flame: FlameDescriptor; tracks: TimelineTrack[] }

function Preview(props: { flameDescriptor: FlameDescriptor }) {
  return (
    <Root
      adapterOptions={{
        powerPreference: 'high-performance',
      }}
    >
      <AutoCanvas pixelRatio={1}>
        <Camera2D
          position={vec2f(
            ...props.flameDescriptor.renderSettings.camera.position,
          )}
          zoom={props.flameDescriptor.renderSettings.camera.zoom}
        >
          <Flam3
            quality={DEFAULT_QUALITY}
            pointCountPerBatch={2e4}
            adaptiveFilterEnabled={true}
            animationEnabled={false}
            flameDescriptor={props.flameDescriptor}
            renderInterval={1}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
  )
}

const PREVIEW_FPS = 15

/** AnimatedPreview — renders the animation flame and plays on hover. */
function AnimatedPreview(props: { anim: AnimationDef; index: number }) {
  const baseFlame = getAnimationFlame(props.anim)
  const [animatedFlame, setAnimatedFlame] = createSignal(
    structuredClone(baseFlame),
  )
  const [hovered, setHovered] = createSignal(false)
  const [, setFrame] = createSignal(0)
  let rafId: number | undefined

  function startAnimating() {
    setHovered(true)
    const startTime = performance.now()
    const firstLen = props.anim.tracks[0]?.keyframes.length ?? 0
    const totalFrames =
      firstLen > 0
        ? Math.max(
            ...props.anim.tracks.flatMap((t) =>
              t.keyframes.map((kf) => kf.frame),
            ),
          )
        : 100
    const frameDuration = 1000 / PREVIEW_FPS

    function tick() {
      const elapsed = performance.now() - startTime
      const f = Math.floor(elapsed / frameDuration) % (totalFrames + 1)
      setFrame(f)
      const clone = structuredClone(baseFlame)
      const mockTimeline = {
        currentFrame: () => f,
        tracks: () => props.anim.tracks,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      applyTimelineToFlame(mockTimeline as any, clone)
      setAnimatedFlame(clone)
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
  }

  function stopAnimating() {
    setHovered(false)
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setFrame(0)
    setAnimatedFlame(structuredClone(baseFlame))
  }

  onCleanup(() => {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
  })

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={startAnimating}
      onMouseLeave={stopAnimating}
    >
      <div
        style={{
          opacity: hovered() ? 0 : 1,
          transition: 'opacity 0.2s',
          position: 'absolute',
          inset: 0,
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 2,
          'pointer-events': 'none',
          'font-size': '0.65rem',
          'font-weight': '600',
          'text-transform': 'uppercase',
          'letter-spacing': '0.04em',
          background: 'rgba(0,0,0,0.45)',
          color: '#fff',
          'border-radius': '0.5rem',
        }}
      >
        Hover to preview
      </div>
      <DelayedShow delayMs={props.index * 50}>
        <Preview flameDescriptor={animatedFlame()} />
      </DelayedShow>
      <div class={ui.itemTitle}>
        <span style={{ 'font-weight': '600' }}>{props.anim.name}</span>
        <span
          style={{
            'margin-left': '0.5rem',
            'font-size': '0.65rem',
            opacity: '0.7',
          }}
        >
          {props.anim.description}
        </span>
      </div>
    </div>
  )
}

type LoadFlameModalProps = {
  respond: (payload: FlameDescriptor | AnimationLoad | typeof CANCEL) => void
}

async function pickPngFile(): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const fileHandles = await window
        .showOpenFilePicker({
          id: 'load-flame-from-file',
          types: [{ accept: { 'image/png': ['.png'] } }],
        })
        .catch(() => undefined)
      if (!fileHandles) {
        return null
      }
      const [fileHandle] = fileHandles
      return await fileHandle.getFile()
    }
  } catch (_) {
    // fall through to input-based picker any failure
  }

  // fallback: hidden input element (works on Firefox and Safari/iOS)
  return await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,.png'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.width = '1px'
    input.style.height = '1px'
    input.addEventListener('change', () => {
      const file = input.files && input.files[0] ? input.files[0] : null
      resolve(file ?? null)
      input.remove()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      input.remove()
    })
    document.body.appendChild(input)
    input.click()
  })
}

function LoadFlameModal(props: LoadFlameModalProps) {
  const [recentFlames, setRecentFlames] = createSignal(loadRecentFlames())

  async function loadFromFile() {
    const file = await pickPngFile()
    if (!file) return
    const arrBuf = new Uint8Array(await file.arrayBuffer())
    try {
      const result = await extractFlameFromPng(arrBuf)
      if (result.animation && result.animation.tracks.length > 0) {
        props.respond({
          flame: result.flame,
          tracks: result.animation.tracks,
        })
      } else {
        props.respond(result.flame)
      }
    } catch (err) {
      console.warn(err)
      alert(`No valid flame found in '${file.name}'.`)
    }
  }

  function handleDeleteRecent(e: MouseEvent, id: string) {
    e.stopPropagation()
    deleteRecentFlame(id)
    setRecentFlames(loadRecentFlames())
  }

  function formatDate(timestamp: number) {
    const d = new Date(timestamp)
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Load Flame
        <span class={ui.undoMessage}>You can undo this operation.</span>
      </ModalTitleBar>
      <section>
        From disk <Button onClick={loadFromFile}>Choose File</Button>
      </section>
      <Show when={recentFlames().length > 0}>
        <h2>Recent Flames</h2>
        <section class={ui.gallery}>
          <For each={recentFlames()}>
            {(recent, i) => (
              <button
                class={ui.item}
                onClick={() => {
                  const clone = structuredClone(recent.flame)
                  if (recent.tracks && recent.tracks.length > 0) {
                    props.respond({
                      flame: clone,
                      tracks: structuredClone(recent.tracks),
                    })
                  } else {
                    props.respond(clone)
                  }
                }}
              >
                <DelayedShow delayMs={i() * 30}>
                  <Preview flameDescriptor={recent.flame} />
                </DelayedShow>
                <div class={ui.itemTitle}>
                  <span>{recent.name}</span>
                  <span style={{ 'font-size': '0.7rem', opacity: '0.7' }}>
                    {formatDate(recent.savedAt)}
                  </span>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  style={{
                    position: 'absolute',
                    top: '0.25rem',
                    right: '0.25rem',
                    padding: 'var(--space-1)',
                    'background-color':
                      'rgb(from var(--neutral-950) r g b / 60%)',
                    border: 'none',
                    'border-radius': 'var(--space-1)',
                    cursor: 'pointer',
                    opacity: '0',
                    color: 'white',
                    'line-height': '0',
                    width: '1.5rem',
                    height: '1.5rem',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                  }}
                  onClick={(e) => {
                    handleDeleteRecent(e, recent.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleDeleteRecent(e as unknown as MouseEvent, recent.id)
                    }
                  }}
                  title="Delete"
                >
                  <Cross />
                </span>
              </button>
            )}
          </For>
        </section>
      </Show>
      <h2>Example Gallery</h2>
      <section class={ui.gallery}>
        <For each={recordEntries(examples)}>
          {([exampleId, example], i) => (
            <button
              class={ui.item}
              onClick={() => {
                props.respond(example)
              }}
            >
              <DelayedShow delayMs={i() * 50}>
                <Preview flameDescriptor={example} />
              </DelayedShow>
              <div class={ui.itemTitle}>{exampleId}</div>
            </button>
          )}
        </For>
      </section>
      <Show when={animationDefs.length > 0}>
        <h2>Animation Examples</h2>
        <section class={ui.gallery}>
          <For each={animationDefs}>
            {(anim, i) => (
              <button
                class={ui.item}
                onClick={() => {
                  const flame = getAnimationFlame(anim)
                  props.respond({ flame, tracks: [...anim.tracks] })
                }}
              >
                <AnimatedPreview anim={anim} index={i()} />
              </button>
            )}
          </For>
        </section>
      </Show>
    </>
  )
}

export function createLoadFlame(history: ChangeHistory<FlameDescriptor>) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)
  const [loadedAnimation, setLoadedAnimation] = createSignal<
    AnimationLoad | undefined
  >(undefined)

  async function showLoadFlameModal(): Promise<FlameDescriptor | undefined> {
    setLoadModalIsOpen(true)
    const result = await requestModal<
      FlameDescriptor | AnimationLoad | typeof CANCEL
    >({
      content: ({ respond }) => <LoadFlameModal respond={respond} />,
    })
    setLoadModalIsOpen(false)
    if (result === CANCEL) {
      return undefined
    }
    // Animation load: flame + keyframe tracks
    if (typeof result === 'object' && 'tracks' in result) {
      if (IS_DEV)
        console.info(
          '[load] animation selected —',
          result.tracks.length,
          'tracks, batching flame + tracks atomically',
        )
      batch(() => {
        history.replace(structuredClone(result.flame))
        setLoadedAnimation({
          flame: structuredClone(result.flame),
          tracks: result.tracks.map((t) => ({
            ...t,
            keyframes: t.keyframes.map((kf) => ({ ...kf })),
          })),
        })
      })
      return result.flame
    }
    // Plain flame load — clear any animation tracks
    if (IS_DEV)
      console.info(
        '[load] plain flame selected — batching flame + empty tracks',
      )
    batch(() => {
      history.replace(structuredClone(result))
      setLoadedAnimation({ flame: structuredClone(result), tracks: [] })
    })
    return result
  }

  return {
    showLoadFlameModal,
    loadModalIsOpen,
    loadedAnimation,
    setLoadedAnimation,
    clearLoadedAnimation: () => {
      setLoadedAnimation(undefined)
    },
  }
}
