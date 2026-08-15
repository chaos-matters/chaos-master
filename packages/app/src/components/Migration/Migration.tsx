import { defaultKeymap, history, historyKeymap, indentWithTab, } from '@codemirror/commands'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { unwrap } from 'solid-js/store'
import { vec2f, vec4f } from 'typegpu/data'
import { VariationMultiSelect } from '@/components/VariationMultiSelect/VariationMultiSelect'
import { DEFAULT_QUALITY, IS_DEV } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { FLAM3_SAMPLES } from '@/flame/flam3Samples'
import { isFlameXmlContent, parseFlameXmlWithReport, registerImportedFlamePalette, resolveVariationType, } from '@/flame/flameXml'
import { latestSchemaVersion, validateFlameWithErrors, } from '@/flame/schema/flameSchema'
import { variationTypes } from '@/flame/variations'
import { getTransformsForEachVariation, getTransformWithAllVariations, } from '@/flame/variations/utils'
import { Copy } from '@/icons'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Root } from '@/lib/Root'
import { extractFlameFromPng } from '@/utils/flameInPng'
import { persistentSignal } from '@/utils/persistentSignal'
import { Button } from '../Button/Button'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import { wgslTheme } from '../WgslEditor/theme'
import ui from './Migration.module.css'
import type { Diagnostic } from '@codemirror/lint'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TransformVariationType } from '@/flame/variations'

const CANCEL = 'cancel'

// The ~49 variations catalogued in the original Fractal Flame paper (Draves &
// Reckase, variations 0-48) — a focused, recognizable default for the
// "Show … Variations" generators. The previous default (all ~150 General+Blur
// types) was too many to be useful; the user can still widen the selection.
const FLAM3_PAPER_VARIATIONS = [
  'linear',
  'sinusoidal',
  'spherical',
  'swirl',
  'horseshoe',
  'polar',
  'handkerchief',
  'heart',
  'disc',
  'spiral',
  'hyperbolic',
  'diamond',
  'ex',
  'julia',
  'bent',
  'waves',
  'fisheye',
  'popcorn',
  'exponential',
  'power',
  'cosine',
  'rings',
  'fan',
  'blob',
  'pdj',
  'fan2',
  'rings2',
  'eyefish',
  'bubble',
  'cylinder',
  'perspective',
  'noise',
  'julian',
  'juliascope',
  'blur',
  'gaussian_blur',
  'radial_blur',
  'pie',
  'ngon',
  'curl',
  'rectangles',
  'arch',
  'tangent',
  'square',
  'rays',
  'blade',
  'secant2',
  'twintrian',
  'cross',
]

function defaultScopedVariations(): Set<TransformVariationType> {
  const set = new Set<TransformVariationType>()
  for (const name of FLAM3_PAPER_VARIATIONS) {
    const type = resolveVariationType(name)
    if (type !== undefined && variationTypes.includes(type)) {
      set.add(type)
    }
  }
  return set
}

// ── Live Preview ──────────────────────────────────────────────────────────

function Preview(props: { flameDescriptor: FlameDescriptor }) {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
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

// ── File Picker ───────────────────────────────────────────────────────────

async function importFromFile(): Promise<File | null> {
  try {
    if ('showOpenFilePicker' in window) {
      const fileHandles = await window
        .showOpenFilePicker({
          id: 'migration-load-file',
          types: [
            {
              accept: {
                'image/png': ['.png'],
                'application/json': ['.json'],
                'text/xml': ['.flame', '.xml'],
              },
            },
          ],
        })
        .catch(() => undefined)
      if (!fileHandles) return null
      const [fileHandle] = fileHandles
      return await fileHandle.getFile()
    }
  } catch {
    // fall through to input-based picker
  }

  return await new Promise<File | null>((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,.png,application/json,.json,.flame,.xml'
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.style.width = '1px'
    input.style.height = '1px'
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      resolve(file)
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

// ── Copy-to-clipboard button with transient feedback ───────────────────────

function CopyButton(props: { getText: () => string; label: string }) {
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => {
    clearTimeout(timer)
  })

  const handleCopy = async () => {
    const text = props.getText().trim()
    if (!text) return
    try {
      await globalThis.navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timer)
      timer = setTimeout(() => setCopied(false), 1600)
    } catch (err) {
      console.warn(err)
    }
  }

  return (
    <button
      class={ui.inlineCopyButton}
      classList={{ [ui.inlineCopyButtonCopied!]: copied() }}
      type="button"
      title={copied() ? 'Copied!' : props.label}
      aria-label={props.label}
      onClick={handleCopy}
    >
      <Show when={copied()} fallback={<Copy />}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Show>
      <Show when={copied()}>
        <span class={ui.copiedToast}>Copied!</span>
      </Show>
    </button>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

type MigrationFlameModalProps = {
  respond: (flameDescriptor: FlameDescriptor | typeof CANCEL) => void
  currentFlame: FlameDescriptor
}

function Migration(props: MigrationFlameModalProps) {
  const [inputLabel, setInputLabel] = createSignal('JSON')
  const [inputFlameVersion, setInputFlameVersion] = createSignal('')
  const [outputData, setOutputData] = createSignal('')
  const [previewFlame, setPreviewFlame] = createSignal<
    FlameDescriptor | undefined
  >(structuredClone(props.currentFlame))
  const [validationErrors, setValidationErrors] = createSignal<string[]>([])
  // Non-fatal import notices (e.g. flam3 variations with no CM equivalent).
  const [importWarnings, setImportWarnings] = createSignal<string[]>([])

  // Which variation types the "Show … Variations" generators emit. Scoped to
  // General + Blur by default so the generated flame stays within GPU limits.
  // Persisted across opens so a user's refined selection sticks; unknown types
  // (e.g. removed/renamed variations) are dropped on load.
  const [scopedVariations, setScopedVariations] = persistentSignal<
    Set<TransformVariationType>,
    TransformVariationType[]
  >('migration/scoped-variations', defaultScopedVariations(), {
    serialize: (set) => [...set],
    deserialize: (arr) =>
      new Set(arr.filter((type) => variationTypes.includes(type))),
  })
  const [variationScopeExpanded, setVariationScopeExpanded] =
    createSignal(false)

  const toggleScopedVariation = (type: TransformVariationType) => {
    setScopedVariations((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // CodeMirror refs
  let editorContainer: HTMLDivElement | undefined
  let editorView: EditorView | undefined

  function getPrettyJson(text: string): string {
    try {
      return JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      return text
    }
  }

  function stringifyError(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message
    if (typeof err === 'string') return err
    try {
      return JSON.stringify(err)
    } catch {
      return String(err)
    }
  }

  // ── Validation + lint markers ─────────────────────────────────────────

  function showLintErrors(errors: string[]) {
    if (!editorView) return
    const diags: Diagnostic[] = []
    const doc = editorView.state.doc
    const text = doc.toString()
    const lines = text.split('\n')

    for (const err of errors) {
      // Try to extract line info from error messages like "transforms: missing key"
      // or position from JSON parse errors like "at position 123"
      let line = 0
      const posMatch = /at position (\d+)/.exec(err)
      if (posMatch) {
        const pos = parseInt(posMatch[1]!, 10)
        let count = 0
        for (let i = 0; i < lines.length; i++) {
          count += (lines[i]?.length ?? 0) + 1 // +1 for newline
          if (count > pos) {
            line = i
            break
          }
        }
      }
      const lineObj = doc.line(Math.min(line + 1, doc.lines))
      diags.push({
        from: lineObj.from,
        to: lineObj.to,
        severity: 'error',
        message: err,
      })
    }

    editorView.dispatch(setDiagnostics(editorView.state, diags))
  }

  function clearLint() {
    if (!editorView) return
    editorView.dispatch(setDiagnostics(editorView.state, []))
  }

  // ── Parse + validate ──────────────────────────────────────────────────

  function detectAndParse(text: string): FlameDescriptor | undefined {
    const trimmed = text.trim()

    if (isFlameXmlContent(trimmed)) {
      setInputLabel('XML')
      try {
        const { flame, warnings } = parseFlameXmlWithReport(trimmed)
        // Surface non-fatal import warnings (e.g. unmapped variations) to the
        // user instead of only the console.
        setImportWarnings(warnings)
        // Save the file's embedded gradient to the palette library (deduped).
        registerImportedFlamePalette(trimmed)
        return flame
      } catch (err) {
        const errStr = stringifyError(err)
        setValidationErrors([errStr])
        showLintErrors([errStr])
        return undefined
      }
    }

    if (trimmed.startsWith('{')) {
      setInputLabel('JSON')
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch (err) {
        const errStr = stringifyError(err)
        setValidationErrors([errStr])
        showLintErrors([errStr])
        return undefined
      }

      // A flame descriptor may be bare ({ transforms, ... }) or wrapped in a
      // share payload ({ flame, animation }) — the same shape embedded in a
      // shared PNG. Try the most-likely candidate first, then fall back, and
      // accept the first that validates.
      const obj = parsed as Record<string, unknown> | null
      const wrapped =
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.flame === 'object' &&
        obj.flame !== null
      const candidates: unknown[] =
        wrapped && !('transforms' in (obj ?? {}))
          ? [(obj as { flame: unknown }).flame, parsed]
          : wrapped
            ? [parsed, (obj as { flame: unknown }).flame]
            : [parsed]

      let lastErrors: string[] = []
      for (const candidate of candidates) {
        const errors: string[] = []
        const result = validateFlameWithErrors(candidate, (err) =>
          errors.push(err),
        )
        if (result && errors.length === 0) {
          setValidationErrors([])
          clearLint()
          setInputFlameVersion(result.version ?? '?.?')
          return result
        }
        lastErrors = errors
      }
      setValidationErrors(
        lastErrors.length > 0
          ? lastErrors
          : ['Could not read a flame descriptor from this JSON.'],
      )
      showLintErrors(lastErrors)
      return undefined
    }

    setInputLabel('Unknown')
    const msg = 'Unrecognized format. Paste JSON or .flame XML.'
    setValidationErrors([msg])
    showLintErrors([msg])
    return undefined
  }

  function validateInput() {
    setOutputData('')
    setValidationErrors([])
    setImportWarnings([])
    clearLint()
    const text = editorView?.state.doc.toString() ?? ''
    if (!text) return

    const newFlame = detectAndParse(text)
    if (newFlame !== undefined) {
      setPreviewFlame(newFlame)
      setInputFlameVersion(newFlame.version ?? '?.?')
      setOutputData(getPrettyJson(JSON.stringify(newFlame)))
    } else {
      setPreviewFlame(undefined)
      setInputFlameVersion('?.?')
    }
  }

  function handleMigrate() {
    setOutputData('')
    const text = editorView?.state.doc.toString() ?? ''
    if (!text) return

    const newFlame = detectAndParse(text)
    if (newFlame !== undefined) {
      const errors: string[] = []
      const raw = JSON.parse(JSON.stringify(newFlame))
      const migrated = validateFlameWithErrors(raw, (err) => errors.push(err))
      if (migrated) {
        migrated.version = latestSchemaVersion
        setPreviewFlame(migrated)
        setInputFlameVersion(latestSchemaVersion)
        setOutputData(getPrettyJson(JSON.stringify(migrated)))
        setValidationErrors([])
        clearLint()
      } else {
        setValidationErrors(errors)
        showLintErrors(errors)
      }
    }
  }

  function setEditorText(text: string) {
    if (!editorView) return
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: text,
      },
    })
  }

  function loadSample(xml: string) {
    setEditorText(xml)
    setInputLabel('XML')
    validateInput()
  }

  function handleCreateVariationsExampleSet() {
    const flames = getTransformWithAllVariations([...scopedVariations()])
    setEditorText(getPrettyJson(JSON.stringify(flames)))
    setInputLabel('JSON')
    validateInput()
  }

  function handleCreateTransformsExampleSet() {
    const flames = getTransformsForEachVariation([...scopedVariations()])
    setEditorText(getPrettyJson(JSON.stringify(flames)))
    setInputLabel('JSON')
    validateInput()
  }

  async function loadFromFile() {
    const file = await importFromFile()
    if (!file) return
    try {
      const name = file.name.toLowerCase()
      const isPng = file.type.startsWith('image/png') || name.endsWith('.png')

      if (isPng) {
        // PNG carries the flame in a zTXt chunk as { flame, animation? }.
        // Drop into the editor as the bare flame descriptor (the editor + the
        // migration output are about the FlameDescriptor, not the animation).
        const arrBuf = new Uint8Array(await file.arrayBuffer())
        const extracted = await extractFlameFromPng(arrBuf).catch(
          () => undefined,
        )
        if (extracted?.flame) {
          setEditorText(getPrettyJson(JSON.stringify(extracted.flame)))
          setInputLabel('JSON')
          validateInput()
        } else {
          const msg = `'${file.name}' has no embedded flame data.`
          setValidationErrors([msg])
          showLintErrors([msg])
        }
        return
      }

      // .flame / .xml / .json / any text: drop the raw content in and let
      // detectAndParse recognise the format (flame XML vs JSON, bare vs wrapped)
      // and validate. JSON is pretty-printed; XML is left as-is.
      const text = await file.text()
      setEditorText(text.trim().startsWith('{') ? getPrettyJson(text) : text)
      validateInput()
    } catch (err) {
      console.warn(err)
    }
  }

  // ── CodeMirror lifecycle ──────────────────────────────────────────────

  onMount(() => {
    if (!editorContainer) return

    const initialText = getPrettyJson(JSON.stringify(props.currentFlame))
    if (props.currentFlame.version !== undefined) {
      setInputFlameVersion(props.currentFlame.version)
    }

    const extensions = [
      lineNumbers(),
      history(),
      lintGutter(),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        {
          key: 'Ctrl-Enter',
          run: () => {
            validateInput()
            return true
          },
        },
        {
          key: 'Cmd-Enter',
          run: () => {
            validateInput()
            return true
          },
        },
      ]),
      wgslTheme,
    ]

    editorView = new EditorView({
      state: EditorState.create({ doc: initialText, extensions }),
      parent: editorContainer,
    })

    onCleanup(() => {
      editorView?.destroy()
    })
  })

  return (
    <>
      <ModalTitleBar
        onClose={() => {
          props.respond(CANCEL)
        }}
      >
        Migration Toolbox
      </ModalTitleBar>
      <div class={ui.previewHeader}>
        <span class={ui.previewHeaderLabel}>
          Paste JSON or .flame XML to convert to a valid FlameDescriptor
        </span>
        <Button onClick={loadFromFile}>Load File</Button>
      </div>
      <section class={ui.migration}>
        <div class={ui.previewColumn}>
          <div class={ui.textPanel}>
            <div class={ui.textPanelHeader}>
              <h3 class={ui.textPanelTitle}>
                Input ({inputLabel()})
                <Show when={inputFlameVersion()}>
                  <span> — v{inputFlameVersion()}</span>
                </Show>
              </h3>
              <CopyButton
                label="Copy input"
                getText={() => editorView?.state.doc.toString() ?? ''}
              />
            </div>
            <div class={ui.textPanelBody}>
              <div ref={editorContainer} class={ui.codeMirrorEditor} />
            </div>
          </div>
        </div>
        <div class={ui.previewColumn} classList={{ [ui.outputColumn!]: true }}>
          <div class={ui.outputSplit}>
            <div class={ui.textPanel}>
              <div class={ui.textPanelHeader}>
                <h3 class={ui.textPanelTitle}>
                  Output Flame
                  <Show when={previewFlame()}> (valid)</Show>
                </h3>
                <CopyButton label="Copy output" getText={outputData} />
              </div>
              <div class={ui.textPanelBody}>
                <Show when={importWarnings().length > 0}>
                  <div class={ui.warningNotice}>
                    Imported with warnings:
                    <ul>
                      <For each={importWarnings()}>{(w) => <li>{w}</li>}</For>
                    </ul>
                  </div>
                </Show>
                <Show
                  when={validationErrors().length === 0}
                  fallback={
                    <pre class={ui.errorPreview}>
                      {validationErrors().join('\n')}
                    </pre>
                  }
                >
                  <pre class={ui.outputPreview}>{outputData()}</pre>
                </Show>
              </div>
            </div>
            <section class={ui.previewFlame}>
              <Show when={previewFlame()}>
                {(flame) => (
                  <button
                    class={ui.item}
                    onClick={() => {
                      props.respond(flame())
                    }}
                  >
                    <Preview flameDescriptor={flame()} />
                    <div class={ui.itemTitle}>
                      {flame().metadata?.name || 'Preview'}
                    </div>
                  </button>
                )}
              </Show>
            </section>
          </div>
        </div>
      </section>
      <div class={ui.variationScope}>
        <button
          type="button"
          class={ui.variationScopeHeader}
          onClick={() => setVariationScopeExpanded(!variationScopeExpanded())}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class={ui.chevron}
            classList={{
              [ui.chevronExpanded!]: variationScopeExpanded(),
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <span>
            Variations for "Show …" ({scopedVariations().size}/
            {variationTypes.length})
          </span>
        </button>
        <Show when={variationScopeExpanded()}>
          <div class={ui.variationScopeBody}>
            <VariationMultiSelect
              dims={2}
              allVariations={variationTypes}
              selected={scopedVariations()}
              onToggle={toggleScopedVariation}
              onSelectAll={() => setScopedVariations(new Set(variationTypes))}
              onDeselectAll={() => setScopedVariations(new Set())}
            />
          </div>
        </Show>
      </div>
      <section class={ui.actions}>
        <Button onClick={validateInput}>Validate</Button>
        <Button onClick={handleMigrate}>Migrate</Button>
        <Button onClick={handleCreateTransformsExampleSet}>
          Show Per-Variation Transforms
        </Button>
        {/* "Show All Variations" builds one flame from every selected variation
            — handy for debugging but overwhelming for normal use, so dev-only. */}
        <Show when={IS_DEV}>
          <Button onClick={handleCreateVariationsExampleSet}>
            Show All Variations
          </Button>
        </Show>
      </section>
      <section class={ui.samples}>
        <span class={ui.samplesLabel}>Sample .flame files</span>
        <div class={ui.samplePills}>
          <For each={FLAM3_SAMPLES}>
            {(sample) => (
              <button
                type="button"
                class={ui.samplePill}
                title={sample.description}
                onClick={() => {
                  loadSample(sample.xml)
                }}
              >
                {sample.name}
              </button>
            )}
          </For>
        </div>
      </section>
    </>
  )
}

// ── Modal Factory ─────────────────────────────────────────────────────────

export function createMigrationModal(
  loadIntoMainView: (flame: FlameDescriptor) => void,
) {
  const requestModal = useRequestModal()
  const [loadModalIsOpen, setLoadModalIsOpen] = createSignal(false)

  async function showMigrationModal(currentFlame: FlameDescriptor) {
    setLoadModalIsOpen(true)
    const result = await requestModal<FlameDescriptor | typeof CANCEL>({
      content: ({ respond }) => (
        <Migration respond={respond} currentFlame={currentFlame} />
      ),
    })
    setLoadModalIsOpen(false)
    if (result === CANCEL) return
    loadIntoMainView(structuredClone(unwrap(result)))
  }

  return {
    showMigrationModal,
    loadModalIsOpen,
  }
}
