import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, untrack, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { useToast } from '@/contexts/ToastContext'
import { DEFAULT_VARIATION_PREVIEW_POINT_COUNT, DEFAULT_VARIATION_PREVIEW_QUALITY, } from '@/defaults'
import { defineExample } from '@/flame/examples/util'
import { Flam3 } from '@/flame/Flam3'
import { generateTransformId, generateVariationId, } from '@/flame/transformFunction'
import { createCustomVariation, deleteCustomVariation, duplicateCustomVariation, getCustomVariations, previewCustomVariation, updateCustomVariation, } from '@/flame/variations/custom'
import { BoxArrowRight, Cross, Plus, Sparkle, Terminal } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { mathModeTutorial } from '@/tutorials/mathModeTutorial'
import { MathEditor } from '../MathEditor/MathEditor'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { TutorialModal } from '../TutorialModal/TutorialModal'
import { WgslEditor } from '../WgslEditor'
import ui from './CustomVariationEditor.module.css'
import type { Diagnostic } from '@codemirror/lint'
import type { TutorialPage } from '../TutorialModal/TutorialModal'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { CustomVariationDef } from '@/flame/variations/custom'
import type { CompileError } from '@/flame/variations/custom/runtimeCompiler'

const CANCEL = 'cancel' as const
type RespondType = typeof CANCEL | { def: CustomVariationDef }

const PREVIEW_VARIATION_ID = generateVariationId()
const PREVIEW_TRANSFORM_ID = generateTransformId('custom_preview')

const WGSL_EXAMPLES = [
  {
    name: 'Polar Ripple',
    wgsl: `  let r = length(pos);
  let theta = atan2(pos.y, pos.x);
  let ripple = sin(r * 8.0) * 0.5 + 0.5;
  let newR = r + ripple * 0.2 * varInfo.weight;
  return vec2f(newR * cos(theta), newR * sin(theta));`,
  },
  {
    name: 'Julia Nega',
    wgsl: `  let r = sqrt(length(pos));
  let theta = atan2(pos.y, pos.x);
  let omega = select(0.0, 3.14159265, theta < 0.0);
  let newTheta = theta * 0.5 + omega;
  let negR = -r;
  return vec2f(negR * cos(newTheta), negR * sin(newTheta));`,
  },
  {
    name: 'Swirl',
    wgsl: `  let r = length(pos);
  let theta = atan2(pos.y, pos.x) + r * 0.3 * varInfo.weight;
  return vec2f(r * cos(theta), r * sin(theta));`,
  },
  {
    name: 'Fisheye',
    wgsl: `  let r = length(pos);
  let newR = r * r;
  return pos * (newR / max(r, 0.001)) * varInfo.weight + pos * (1.0 - varInfo.weight);`,
  },
  {
    name: 'Waves',
    wgsl: `  return vec2f(pos.x + sin(pos.y * 5.0) * varInfo.weight * 0.1, pos.y + sin(pos.x * 5.0) * varInfo.weight * 0.1);`,
  },
  {
    name: 'Handkerchief',
    wgsl: `  let theta = atan2(pos.y, pos.x);
  let r = length(pos);
  return vec2f(sin(theta + r) * r, cos(theta - r) * r);`,
  },
  {
    name: 'Power',
    wgsl: `  let r = length(pos);
  let theta = atan2(pos.y, pos.x);
  let newR = pow(r, sin(theta * 2.0) * 0.5 + 1.0) * varInfo.weight + r * (1.0 - varInfo.weight);
  return vec2f(newR * cos(theta), newR * sin(theta));`,
  },
  {
    name: 'Bubble',
    wgsl: `  let r = length(pos);
  let theta = atan2(pos.y, pos.x);
  let r2 = 4.0 * (r - 0.5);
  let newR = (1.0 - varInfo.weight) * r + varInfo.weight * (r / max(0.25 + r2 * r2, 0.001));
  return vec2f(newR * cos(theta), newR * sin(theta));`,
  },
]

const MATH_EXAMPLES = [
  {
    name: 'Polar Distance',
    math: String.raw`r = \sqrt{x^2 + y^2}`,
  },
  {
    name: 'Angle',
    math: String.raw`\theta = \arctan2(p_y, p_x)`,
  },
  {
    name: 'Ripple',
    math: String.raw`r = r + \sin(r \cdot 8) \cdot w`,
  },
  {
    name: 'Spiral',
    math: String.raw`\theta = \theta + r \cdot 0.5`,
  },
  {
    name: 'Power Curve',
    math: String.raw`r = r^w`,
  },
  {
    name: 'Wave',
    math: String.raw`p_x = p_x + \sin(p_y \cdot 5) \cdot w`,
  },
]

function makePreviewFlame(variationType: string): FlameDescriptor {
  return defineExample({
    renderSettings: {
      exposure: 0.3,
      skipIters: 1,
      drawMode: 'light',
      backgroundColor: [0, 0, 0],
      camera: { zoom: 1, position: [0, 0] },
      colorInitMode: 'colorInitPosition',
      pointInitMode: 'pointInitUnitDisk',
    },
    transforms: {
      [PREVIEW_TRANSFORM_ID]: {
        probability: 1,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0, y: 0 },
        variations: {
          [PREVIEW_VARIATION_ID]: {
            type: variationType,
            weight: 1,
            visible: true,
          },
        },
      },
    },
  })
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'compiling' }
  | { status: 'error'; errors: CompileError[] }
  | { status: 'compiled'; id: string; unregister: () => void }

type SaveResult =
  | { success: true; def: CustomVariationDef }
  | { success: false; errors: CompileError[] }

function ShowCustomVariationEditor(props: {
  respond: (value: RespondType) => void
  existingDef?: CustomVariationDef
}) {
  const { showToast } = useToast()
  const requestModal = useRequestModal()
  const [activeId, setActiveId] = createSignal<string | undefined>()
  const [activeExampleName, setActiveExampleName] = createSignal<
    string | undefined
  >()
  const [code, setCode] = createSignal('')
  const [name, setName] = createSignal('Untitled')
  const [variations, setVariations] = createSignal<CustomVariationDef[]>(
    getCustomVariations(),
  )
  const [preview, setPreview] = createSignal<PreviewState>({ status: 'idle' })
  const [previewKey, setPreviewKey] = createSignal(0)

  const [editorMode, setEditorMode] = createSignal<'wgsl' | 'math'>('wgsl')
  const [mathText, setMathText] = createSignal('')
  const [showPreview, setShowPreview] = createSignal(
    !window.matchMedia('(max-height: 500px)').matches,
  )

  const activeVariation = createMemo(() => {
    const id = activeId()
    if (!id) return
    return variations().find((v) => v.id === id)
  })

  const isDirty = createMemo(() => {
    const av = activeVariation()
    if (!av) return code() !== '' || name() !== 'Untitled'
    return av.wgsl !== code() || av.name !== name()
  })

  const canSave = createMemo(() => {
    const p = preview()
    return p.status === 'compiled' && isDirty()
  })

  const diagnostics = createMemo((): Diagnostic[] => {
    const p = preview()
    if (p.status !== 'error') return []
    return p.errors.map((e) => {
      const line = e.line ?? 0
      // Find line start position in the document
      const doc = code()
      let pos = 0
      for (let i = 0; i < line; i++) {
        const nl = doc.indexOf('\n', pos)
        if (nl === -1) break
        pos = nl + 1
      }
      const lineEnd = doc.indexOf('\n', pos)
      const to = lineEnd === -1 ? doc.length : lineEnd
      return {
        from: pos,
        to,
        severity: 'error' as const,
        message: e.message,
      }
    })
  })

  const previewVariationType = createMemo(() => {
    const p = preview()
    if (p.status === 'compiled') return p.id
    return 'linear'
  })

  const previewFlame = createMemo(() => {
    void previewKey()
    const id = previewVariationType()
    return makePreviewFlame(id)
  })

  onMount(() => {
    if (props.existingDef) loadVariation(props.existingDef)
  })

  function loadVariation(def: CustomVariationDef) {
    // Clean up any existing preview
    const p = untrack(preview)
    if (p.status === 'compiled') p.unregister()
    setActiveId(def.id)
    setActiveExampleName(undefined)
    setName(def.name)
    setCode(def.wgsl)
    setPreview({ status: 'idle' })
    setPreviewKey((k) => k + 1)
  }

  function createNew() {
    const p = untrack(preview)
    if (p.status === 'compiled') p.unregister()
    setActiveId(undefined)
    setActiveExampleName(undefined)
    setName('Untitled')
    setCode('')
    setPreview({ status: 'idle' })
    setPreviewKey((k) => k + 1)
  }

  function loadExample(exName: string, wgsl: string) {
    const p = untrack(preview)
    if (p.status === 'compiled') p.unregister()
    setActiveId(undefined)
    setActiveExampleName(exName)
    setName(exName)
    setCode(wgsl)
    setPreview({ status: 'idle' })
    setPreviewKey((k) => k + 1)
  }

  function loadMathExample(exName: string, math: string) {
    const p = untrack(preview)
    if (p.status === 'compiled') p.unregister()
    setActiveId(undefined)
    setActiveExampleName(exName)
    setEditorMode('math')
    setName(exName)
    setMathText(math)
    setPreview({ status: 'idle' })
    setPreviewKey((k) => k + 1)
  }

  function handleDelete(id: string) {
    if (!deleteCustomVariation(id)) {
      showToast('Failed to delete custom variation (not found or system error)')
      return
    }
    setVariations(getCustomVariations())
    if (activeId() === id) {
      const p = untrack(preview)
      if (p.status === 'compiled') p.unregister()
      setActiveId(undefined)
      setCode('')
      setName('Untitled')
      setPreview({ status: 'idle' })
      setPreviewKey((k) => k + 1)
    }
  }

  function handleDuplicate(id: string) {
    const result = duplicateCustomVariation(id)
    if (result.success) {
      setVariations(getCustomVariations())
      loadVariation(result.def)
    } else {
      showToast(
        `Failed to duplicate: ${result.errors?.[0]?.message ?? 'Unknown error'}`,
      )
    }
  }

  function handleCompile() {
    const body = code()
    const p = untrack(preview)

    if (!body.trim()) {
      if (p.status === 'compiled') p.unregister()
      setPreview({ status: 'idle' })
      return
    }

    setPreview({ status: 'compiling' })

    const result = previewCustomVariation(body)
    if (p.status === 'compiled') p.unregister()

    if (result.valid) {
      setPreview({
        status: 'compiled',
        id: result.id,
        unregister: result.unregister,
      })
      setPreviewKey((k) => k + 1)
    } else {
      setPreview({ status: 'error', errors: result.errors })
    }
  }

  function handleCompileNow() {
    handleCompile()
  }

  // Auto-compile debounce: recompile 600ms after last code change
  createEffect(() => {
    code() // Track dependency
    const timer = setTimeout(() => {
      handleCompile()
    }, 600)
    onCleanup(() => {
      clearTimeout(timer)
    })
  })

  function handleSave(): SaveResult {
    const body = code()
    const variationName = name()
    const existing = activeId()

    let result: SaveResult
    if (existing) {
      result = updateCustomVariation(existing, body, variationName)
    } else {
      result = createCustomVariation(variationName, body)
    }

    if (result.success) {
      setVariations(getCustomVariations())
      setActiveId(result.def.id)

      // Re-establish preview with the real ID
      const p = untrack(preview)
      if (p.status === 'compiled') p.unregister()
      const newPreview = previewCustomVariation(body)
      if (newPreview.valid) {
        setPreview({
          status: 'compiled',
          id: newPreview.id,
          unregister: newPreview.unregister,
        })
        setPreviewKey((k) => k + 1)
      }
    }

    return result
  }

  function handleExportItem(def: CustomVariationDef) {
    const blob = new Blob([def.wgsl], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${def.name.replace(/\s+/g, '_')}.wgsl`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleUseItem(def: CustomVariationDef) {
    props.respond({ def })
  }

  function showTutorialModal(tutorial: {
    title: string
    pages: TutorialPage[]
  }) {
    void requestModal({
      class: ui.tutorialModal,
      content: ({ respond }) => (
        <TutorialModal
          title={tutorial.title}
          pages={tutorial.pages}
          respond={respond}
        />
      ),
    })
  }

  onCleanup(() => {
    const p = untrack(preview)
    if (p.status === 'compiled') p.unregister()
  })

  const statusText = createMemo(() => {
    const p = preview()
    switch (p.status) {
      case 'idle':
        return 'Ready'
      case 'compiling':
        return 'Compiling...'
      case 'error':
        return 'Error'
      case 'compiled':
        return 'Compiled'
    }
  })

  return (
    <div class={ui.root}>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Custom Variation Editor
      </ModalTitleBar>

      <div class={ui.main}>
        {/* --- Sidebar --- */}
        <aside class={ui.sidebar}>
          <div class={ui.sidebarHeader}>
            <span class={ui.sidebarTitle}>Variations</span>
            <button
              class={ui.newButton}
              onClick={createNew}
              title="New variation"
            >
              <Plus width="0.875rem" />
            </button>
          </div>

          <Show
            when={variations().length > 0}
            fallback={
              <div class={ui.emptySidebar}>
                No custom variations yet. Click + to create one.
              </div>
            }
          >
            <For each={variations()}>
              {(v) => (
                <div
                  class={ui.variationItem}
                  classList={{
                    [ui.variationItemActive as string]: activeId() === v.id,
                  }}
                  onClick={() => {
                    loadVariation(v)
                  }}
                >
                  <Sparkle width="0.75rem" />
                  <span class={ui.variationName}>{v.name}</span>
                  <span class={ui.variationActions}>
                    <button
                      class={ui.iconButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExportItem(v)
                      }}
                      title="Export as .wgsl file"
                    >
                      <BoxArrowRight width="0.625rem" />
                    </button>
                    <button
                      class={`${ui.iconButton} ${ui.iconButtonPrimary}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleUseItem(v)
                      }}
                      title="Add to flame"
                    >
                      <Sparkle width="0.625rem" />
                    </button>
                    <button
                      class={ui.iconButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDuplicate(v.id)
                      }}
                      title="Duplicate"
                    >
                      <Plus width="0.625rem" />
                    </button>
                    <button
                      class={`${ui.iconButton} ${ui.iconButtonDanger}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(v.id)
                      }}
                      title="Delete"
                    >
                      <Cross width="0.625rem" />
                    </button>
                  </span>
                </div>
              )}
            </For>
          </Show>

          <div class={ui.examplesSection}>
            <div class={ui.examplesTitle}>Examples</div>
            <Show
              when={editorMode() === 'wgsl'}
              fallback={
                <For each={MATH_EXAMPLES}>
                  {(ex) => (
                    <button
                      class={ui.exampleButton}
                      classList={{
                        [ui.exampleButtonActive as string]:
                          activeExampleName() === ex.name,
                      }}
                      onClick={() => {
                        loadMathExample(ex.name, ex.math)
                      }}
                      title={`Load ${ex.name} example`}
                    >
                      {ex.name}
                    </button>
                  )}
                </For>
              }
            >
              <For each={WGSL_EXAMPLES}>
                {(ex) => (
                  <button
                    class={ui.exampleButton}
                    classList={{
                      [ui.exampleButtonActive as string]:
                        activeExampleName() === ex.name,
                    }}
                    onClick={() => {
                      loadExample(ex.name, ex.wgsl)
                    }}
                    title={`Load ${ex.name} example`}
                  >
                    {ex.name}
                  </button>
                )}
              </For>
            </Show>
          </div>
        </aside>

        {/* --- Editor --- */}
        <div class={ui.editorPanel}>
          <input
            class={ui.nameInput}
            type="text"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="Variation name"
          />

          <div class={ui.tabBar}>
            <button
              class={ui.tab}
              classList={{ [ui.tabActive as string]: editorMode() === 'wgsl' }}
              onClick={() => setEditorMode('wgsl')}
            >
              WGSL
            </button>
            <button
              class={ui.tab}
              classList={{ [ui.tabActive as string]: editorMode() === 'math' }}
              onClick={() => setEditorMode('math')}
            >
              Math
            </button>
            <div style={{ flex: 1 }} />
            <button
              class={ui.helpButton}
              onClick={() => {
                showTutorialModal(mathModeTutorial)
              }}
              title="Math mode tutorial"
            >
              ?
            </button>
          </div>

          <Show
            when={editorMode() === 'wgsl'}
            fallback={
              <MathEditor
                mathText={mathText()}
                onChange={setMathText}
                onWgslChange={setCode}
                onCtrlEnter={handleCompileNow}
              />
            }
          >
            <div class={ui.editorWrapper}>
              <WgslEditor
                code={code()}
                onChange={setCode}
                diagnostics={diagnostics}
                onCtrlEnter={handleCompileNow}
                placeholder={`// Write your variation function body here.\n// The function signature is:\n//   (pos: vec2f, varInfo: VariationInfo) -> vec2f\n//\n// Available: all WGSL math builtins (sin, cos, length, normalize, etc.)\n//\n// Example:\n//   let r = length(pos);\n//   let theta = atan2(pos.y, pos.x);\n//   return vec2f(r * cos(theta + varInfo.weight), r * sin(theta + varInfo.weight));`}
              />
            </div>
          </Show>

          {/* --- Bottom bar --- */}
          <div class={ui.bottomBar}>
            <span
              classList={{
                [ui.statusIdle as string]: preview().status === 'idle',
                [ui.statusSuccess as string]: preview().status === 'compiled',
                [ui.statusError as string]: preview().status === 'error',
              }}
            >
              <Show when={preview().status === 'compiling'}>
                <Terminal width="0.75rem" />{' '}
              </Show>
              {statusText()}
            </span>

            <Show
              when={
                preview().status === 'error' &&
                (preview() as { status: 'error'; errors: CompileError[] })
              }
            >
              {(p) => (
                <div class={ui.errorList}>
                  <For each={p().errors}>{(e) => <div>{e.message}</div>}</For>
                </div>
              )}
            </Show>

            <div style={{ flex: 1 }} />

            <button
              class={ui.newButton}
              style={{
                width: 'auto',
                padding: '0 var(--space-2)',
                'font-size': '0.75rem',
              }}
              onClick={handleCompile}
            >
              Compile &amp; Preview
            </button>

            <button
              class={ui.newButton}
              style={{
                width: 'auto',
                padding: '0 var(--space-2)',
                'font-size': '0.75rem',
                opacity: canSave() ? 1 : 0.5,
              }}
              disabled={!canSave()}
              onClick={handleSave}
            >
              Save
            </button>
          </div>
        </div>

        {/* --- Preview --- */}
        <div
          class={ui.previewPanel}
          classList={{ [ui.previewPanelCollapsed as string]: !showPreview() }}
        >
          <span class={ui.previewLabel}>Preview</span>
          <button
            class={ui.previewToggle}
            onClick={() => setShowPreview((v) => !v)}
            title={showPreview() ? 'Hide preview' : 'Show preview'}
          >
            {showPreview() ? '×' : '+'}
          </button>
          <Show when={showPreview()}>
            <Show
              when={preview().status === 'compiled'}
              fallback={
                <div class={ui.previewPlaceholder}>
                  {preview().status === 'compiling'
                    ? 'Compiling...'
                    : 'Compile to see preview'}
                </div>
              }
            >
              <div class={ui.previewCanvas}>
                <AutoCanvas pixelRatio={1}>
                  <WheelZoomCamera2D
                    zoom={[() => 1, () => {}]}
                    position={[() => vec2f(), () => undefined]}
                  >
                    <Flam3
                      animationEnabled={false}
                      quality={DEFAULT_VARIATION_PREVIEW_QUALITY}
                      pointCountPerBatch={DEFAULT_VARIATION_PREVIEW_POINT_COUNT}
                      adaptiveFilterEnabled={false}
                      flameDescriptor={previewFlame()}
                      renderInterval={1}
                      edgeFadeColor={vec4f(0)}
                    />
                  </WheelZoomCamera2D>
                </AutoCanvas>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}

export function createShowCustomVariationEditor() {
  const requestModal = useRequestModal()
  const [isOpen, setIsOpen] = createSignal(false)

  async function showCustomVariationEditor(existingDef?: CustomVariationDef) {
    setIsOpen(true)
    const result = await requestModal<RespondType>({
      class: ui.editorModal,
      content: ({ respond }) => (
        <Root adapterOptions={{ powerPreference: 'high-performance' }}>
          <ShowCustomVariationEditor
            respond={respond}
            existingDef={existingDef}
          />
        </Root>
      ),
    })
    setIsOpen(false)
    if (result === CANCEL) return
    return result.def
  }

  return { showCustomVariationEditor, customVariationEditorIsOpen: isOpen }
}
