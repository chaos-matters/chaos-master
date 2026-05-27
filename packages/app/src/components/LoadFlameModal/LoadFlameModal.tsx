import { batch, createSignal, For, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { ANIMATION_PREVIEW_POINT_COUNT, IS_DEV, STATIC_PREVIEW_POINT_COUNT, THUMBNAIL_PREVIEW_QUALITY, THUMBNAIL_PREVIEW_QUALITY_HOVER, } from '@/defaults'
import { examples } from '@/flame/examples'
import { animationDefs, getAnimationFlame } from '@/flame/examples/animations'
import { Flam3 } from '@/flame/Flam3'
import { Cross } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { deepClone } from '@/utils/clone'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { deleteRecentFlame, formatRecentDate, loadRecentFlames, } from '@/utils/recentFlames'
import { recordEntries } from '@/utils/record'
import { applyTracksToFlame } from '@/utils/timeline'
import { Button } from '../Button/Button'
import { DelayedShow } from '../DelayedShow/DelayedShow'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { useAlert } from '../Modal/useAlert'
import { ConfirmDeleteRecentModal, dontAskDeleteRecent, } from './ConfirmDeleteRecentModal'
import ui from './LoadFlameModal.module.css'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ChangeHistory } from '@/utils/createStoreHistory'
import type { TimelineTrack } from '@/utils/timeline'

const { performance } = globalThis

const CANCEL = 'cancel'

type AnimationLoad = { flame: FlameDescriptor; tracks: TimelineTrack[] }

function Preview(props: {
  flameDescriptor: FlameDescriptor
  quality?: number
  pointCountPerBatch?: number
}) {
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
            quality={props.quality ?? THUMBNAIL_PREVIEW_QUALITY}
            pointCountPerBatch={
              props.pointCountPerBatch ?? STATIC_PREVIEW_POINT_COUNT
            }
            adaptiveFilterEnabled={false}
            animationEnabled={false}
            flameDescriptor={props.flameDescriptor}
            renderInterval={1}
            onExportImage={undefined}
            edgeFadeColor={vec4f(0)}
            onAccumulatedPointCount={() => {}}
          />
        </Camera2D>
      </AutoCanvas>
    </Root>
  )
}

const ANIM_TOTAL_FRAMES = 90
const ANIM_FPS = 30
const ANIM_LOOP_MS = (ANIM_TOTAL_FRAMES / ANIM_FPS) * 1000

/** AnimatedPreview -- renders the animation flame, plays on hover. */
function AnimatedPreview(props: {
  anim: (typeof animationDefs)[number]
  index: number
  onSelect: (flame: FlameDescriptor, tracks: TimelineTrack[]) => void
}) {
  const baseFlame = getAnimationFlame(props.anim)
  const [hovered, setHovered] = createSignal(false)
  const [animFrame, setAnimFrame] = createSignal(0)
  let rafId: number | undefined
  let startTime = 0

  function startAnimating() {
    startTime = performance.now()

    function tick() {
      const elapsed = performance.now() - startTime
      const f =
        Math.floor((elapsed / ANIM_LOOP_MS) * ANIM_TOTAL_FRAMES) %
        ANIM_TOTAL_FRAMES
      setAnimFrame(f)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopAnimating() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setAnimFrame(0)
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const displayFlame = (): FlameDescriptor => {
    if (!hovered()) return baseFlame
    const clone = deepClone(baseFlame)
    applyTracksToFlame(props.anim.tracks, clone, animFrame())
    return clone
  }

  return (
    <button
      class={ui.item}
      onClick={() => {
        props.onSelect(baseFlame, [...props.anim.tracks])
      }}
      onMouseEnter={() => {
        setHovered(true)
        startAnimating()
      }}
      onMouseLeave={() => {
        setHovered(false)
        stopAnimating()
      }}
    >
      <DelayedShow delayMs={props.index * 50}>
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <AutoCanvas pixelRatio={1}>
            <Camera2D
              position={vec2f(...displayFlame().renderSettings.camera.position)}
              zoom={displayFlame().renderSettings.camera.zoom}
            >
              <Flam3
                quality={
                  hovered()
                    ? THUMBNAIL_PREVIEW_QUALITY_HOVER
                    : THUMBNAIL_PREVIEW_QUALITY
                }
                pointCountPerBatch={ANIMATION_PREVIEW_POINT_COUNT}
                adaptiveFilterEnabled={false}
                animationEnabled={false}
                flameDescriptor={displayFlame()}
                renderInterval={1}
                onExportImage={undefined}
                edgeFadeColor={vec4f(0)}
                onAccumulatedPointCount={() => {}}
              />
            </Camera2D>
          </AutoCanvas>
        </Root>
      </DelayedShow>
      <div class={ui.itemTitle}>
        <span class={ui.itemName}>{props.anim.name}</span>
        <span class={ui.itemMeta}>
          <span class={ui.itemDesc} title={props.anim.description}>
            {props.anim.description}
          </span>
          <span
            class={ui.animatedBadge}
            title={`${props.anim.tracks.length} animation tracks`}
          >
            <svg
              viewBox="0 0 14 14"
              width="10"
              height="10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path
                d="M7 2 L11 7 L7 12 L3 7 Z"
                fill="currentColor"
                opacity="0.3"
              />
              <path d="M7 2 L11 7 L7 12 L3 7 Z" />
              <line x1="0.5" y1="5" x2="2" y2="5" opacity="0.6" />
              <line x1="0.5" y1="7" x2="2" y2="7" opacity="0.6" />
              <line x1="0.5" y1="9" x2="2" y2="9" opacity="0.6" />
            </svg>
            {props.anim.tracks.length}
          </span>
        </span>
      </div>
    </button>
  )
}

/** RecentFlameItem -- renders a recent flame, plays animation on hover when tracks exist. */
function RecentFlameItem(props: {
  recent: {
    id: string
    name: string
    flame: FlameDescriptor
    savedAt: number
    tracks?: TimelineTrack[]
  }
  index: number
  onSelect: (flame: FlameDescriptor, tracks?: TimelineTrack[]) => void
  onDelete: (e: MouseEvent, id: string) => void
}) {
  const hasTracks = () =>
    !!(props.recent.tracks && props.recent.tracks.length > 0)
  const [hovered, setHovered] = createSignal(false)
  const [animFrame, setAnimFrame] = createSignal(0)
  let rafId: number | undefined
  let startTime = 0

  function startAnimating() {
    startTime = performance.now()

    function tick() {
      const elapsed = performance.now() - startTime
      const f =
        Math.floor((elapsed / ANIM_LOOP_MS) * ANIM_TOTAL_FRAMES) %
        ANIM_TOTAL_FRAMES
      setAnimFrame(f)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
  }

  function stopAnimating() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    setAnimFrame(0)
  }

  onCleanup(() => {
    if (rafId !== undefined) cancelAnimationFrame(rafId)
  })

  const displayFlame = (): FlameDescriptor => {
    if (!hovered() || !hasTracks()) return props.recent.flame
    const clone = deepClone(props.recent.flame)
    applyTracksToFlame(props.recent.tracks!, clone, animFrame())
    return clone
  }

  return (
    <button
      class={ui.item}
      onClick={() => {
        const clone = deepClone(props.recent.flame)
        props.onSelect(
          clone,
          props.recent.tracks ? deepClone(props.recent.tracks) : undefined,
        )
      }}
      onMouseEnter={() => {
        setHovered(true)
        if (hasTracks()) startAnimating()
      }}
      onMouseLeave={() => {
        setHovered(false)
        stopAnimating()
      }}
    >
      <DelayedShow delayMs={props.index * 30}>
        <Show
          when={hasTracks()}
          fallback={<Preview flameDescriptor={props.recent.flame} />}
        >
          <Root adapterOptions={{ powerPreference: 'high-performance' }}>
            <AutoCanvas pixelRatio={1}>
              <Camera2D
                position={vec2f(
                  ...displayFlame().renderSettings.camera.position,
                )}
                zoom={displayFlame().renderSettings.camera.zoom}
              >
                <Flam3
                  quality={
                    hovered()
                      ? THUMBNAIL_PREVIEW_QUALITY_HOVER
                      : THUMBNAIL_PREVIEW_QUALITY
                  }
                  pointCountPerBatch={ANIMATION_PREVIEW_POINT_COUNT}
                  adaptiveFilterEnabled={false}
                  animationEnabled={false}
                  flameDescriptor={displayFlame()}
                  renderInterval={1}
                  onExportImage={undefined}
                  edgeFadeColor={vec4f(0)}
                  onAccumulatedPointCount={() => {}}
                />
              </Camera2D>
            </AutoCanvas>
          </Root>
        </Show>
      </DelayedShow>
      <div class={ui.itemTitle}>
        <span class={ui.itemName}>{props.recent.name}</span>
        <span class={ui.itemMeta}>
          {formatRecentDate(props.recent.savedAt)}
          {hasTracks() && (
            <span
              class={ui.animatedBadge}
              title={`${props.recent.tracks!.length} animation track${props.recent.tracks!.length !== 1 ? 's' : ''}`}
            >
              <svg
                viewBox="0 0 14 14"
                width="10"
                height="10"
                fill="none"
                stroke="currentColor"
                stroke-width="1.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M7 2 L11 7 L7 12 L3 7 Z"
                  fill="currentColor"
                  opacity="0.3"
                />
                <path d="M7 2 L11 7 L7 12 L3 7 Z" />
                <line x1="0.5" y1="5" x2="2" y2="5" opacity="0.6" />
                <line x1="0.5" y1="7" x2="2" y2="7" opacity="0.6" />
                <line x1="0.5" y1="9" x2="2" y2="9" opacity="0.6" />
              </svg>
              {props.recent.tracks!.length}
            </span>
          )}
        </span>
      </div>
      <span
        class={ui.deleteBtn}
        role="button"
        tabIndex={0}
        style={{
          position: 'absolute',
          top: '0.25rem',
          right: '0.25rem',
          padding: 'var(--space-1)',
          'background-color': 'rgb(from var(--neutral-950) r g b / 60%)',
          border: 'none',
          'border-radius': 'var(--space-1)',
          cursor: 'pointer',
          color: 'white',
          'line-height': '0',
          width: '1.5rem',
          height: '1.5rem',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        }}
        onClick={(e) => {
          props.onDelete(e, props.recent.id)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            props.onDelete(e as unknown as MouseEvent, props.recent.id)
          }
        }}
        title="Delete"
      >
        <Cross />
      </span>
    </button>
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
  const showAlert = useAlert()

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
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      showAlert(`No valid flame found in '${file.name}'.`)
    }
  }

  const requestModal = useRequestModal()

  async function handleDeleteRecent(e: MouseEvent, id: string) {
    e.stopPropagation()

    if (!dontAskDeleteRecent()) {
      const confirmed = await requestModal<boolean>({
        content: ({ respond }) => (
          <ConfirmDeleteRecentModal respond={respond} />
        ),
      })
      if (!confirmed) return
    }

    deleteRecentFlame(id)
    setRecentFlames(loadRecentFlames())
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
              <RecentFlameItem
                recent={recent}
                index={i()}
                onSelect={(flame, tracks) => {
                  if (tracks && tracks.length > 0) {
                    props.respond({ flame, tracks })
                  } else {
                    props.respond(flame)
                  }
                }}
                onDelete={(e, id) => {
                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  handleDeleteRecent(e, id)
                }}
              />
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
              <AnimatedPreview
                anim={anim}
                index={i()}
                onSelect={(flame, tracks) => {
                  props.respond({ flame, tracks })
                }}
              />
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
        history.replace(deepClone(result.flame))
        setLoadedAnimation({
          flame: deepClone(result.flame),
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
      history.replace(deepClone(result))
      setLoadedAnimation({ flame: deepClone(result), tracks: [] })
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
