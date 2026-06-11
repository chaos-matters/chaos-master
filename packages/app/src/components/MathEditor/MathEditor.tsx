import { defaultKeymap, history, historyKeymap, indentWithTab, } from '@codemirror/commands'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import { ensureMathJax, getMathJax } from '@/utils/mathjax'
import { mathToWgsl } from '@/utils/mathToWgsl'
import { rainbowBracketPlugin } from '../WgslEditor/rainbowBrackets'
import { wgslTheme } from '../WgslEditor/theme'
import ui from './MathEditor.module.css'

interface MathEditorProps {
  mathText: string
  onChange: (math: string) => void
  onWgslChange: (wgsl: string) => void
  onCtrlEnter?: () => void
}

export function MathEditor(props: MathEditorProps) {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [renderedSvg, setRenderedSvg] = createSignal('')
  const [generatedWgsl, setGeneratedWgsl] = createSignal('')
  const [showWgsl, setShowWgsl] = createSignal(false)
  const [mathJaxLoaded, setMathJaxLoaded] = createSignal(false)
  const [debouncedMath, setDebouncedMath] = createSignal(props.mathText)
  let editorRef: HTMLDivElement | undefined
  let previewRef: HTMLDivElement | undefined
  let view: EditorView | undefined
  let suppressOnChange = false

  onMount(() => {
    // Initialize MathJax
    setLoading(true)
    ensureMathJax()
      .then(() => {
        setLoading(false)
        setMathJaxLoaded(true)
      })
      .catch((e: unknown) => {
        setLoading(false)
        setError(
          `Math renderer unavailable: ${e instanceof Error ? e.message : String(e)}`,
        )
      })

    // Create CodeMirror editor
    if (!editorRef) return

    const extensions = [
      lineNumbers(),
      history(),
      highlightSelectionMatches(),
      rainbowBracketPlugin,
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      ...(props.onCtrlEnter
        ? [
            keymap.of([
              {
                key: 'Ctrl-Enter',
                run: () => {
                  props.onCtrlEnter?.()
                  return true
                },
              },
              {
                key: 'Cmd-Enter',
                run: () => {
                  props.onCtrlEnter?.()
                  return true
                },
              },
            ]),
          ]
        : []),
      wgslTheme,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !suppressOnChange) {
          const newText = update.state.doc.toString()
          if (newText !== props.mathText) {
            handleInput(newText)
          }
        }
      }),
    ]

    const state = EditorState.create({
      doc: props.mathText,
      extensions,
    })

    view = new EditorView({
      state,
      parent: editorRef,
    })
  })

  // External mathText changes (loadMathExample, etc.)
  createEffect(() => {
    const externalText = props.mathText
    const v = view
    if (!v) return

    const currentDoc = v.state.doc.toString()
    if (externalText !== currentDoc) {
      suppressOnChange = true
      v.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: externalText,
        },
        selection: {
          anchor: Math.min(v.state.selection.main.anchor, externalText.length),
          head: Math.min(v.state.selection.main.head, externalText.length),
        },
      })
      suppressOnChange = false
      handleInput(externalText)
    }
  })

  // Debounce mathText changes
  createEffect(() => {
    const text = props.mathText
    const timer = setTimeout(() => {
      setDebouncedMath(text)
    }, 600)
    onCleanup(() => {
      clearTimeout(timer)
    })
  })

  // Reactive math rendering
  createEffect(() => {
    if (!mathJaxLoaded()) return
    renderMath(debouncedMath())
  })

  function renderMath(math: string) {
    if (!math.trim()) {
      setRenderedSvg('')
      return
    }
    const mj = getMathJax()
    if (!mj?.startup?.document) {
      setError('MathJax not ready')
      return
    }
    try {
      const svg = mj.tex2svg(`\\displaystyle{${math}}`).querySelector('svg')
      if (svg) {
        setRenderedSvg(svg.outerHTML)
        setError(null)
      }
    } catch (e: unknown) {
      setError(`Render error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function handleInput(value: string) {
    props.onChange(value)

    const result = mathToWgsl(value)
    if (result.errors.length > 0) {
      setError(result.errors.join('; '))
    } else {
      setError(null)
    }
    if (result.wgsl) {
      props.onWgslChange(result.wgsl)
      setGeneratedWgsl(result.wgsl)
    } else {
      setGeneratedWgsl('')
    }
  }

  onCleanup(() => {
    view?.destroy()
    view = undefined
  })

  return (
    <div class={ui.root}>
      <div class={ui.editorWrapper} ref={editorRef} />
      <div class={ui.previewPanel}>
        <div class={ui.previewLabel}>Rendered</div>
        <div class={ui.previewContent}>
          <Show when={loading()}>
            <div class={ui.statusMsg}>Loading MathJAX...</div>
          </Show>
          <Show when={!loading() && error()}>
            <div class={ui.errorMsg}>{error()}</div>
          </Show>
          <Show when={!loading() && !error() && renderedSvg()}>
            <div
              ref={previewRef}
              class={ui.mathRender}
              innerHTML={renderedSvg()}
            />
          </Show>
          <Show when={!loading() && !error() && !renderedSvg()}>
            <div class={ui.statusMsg}>Enter math to see preview</div>
          </Show>
        </div>
      </div>

      <button
        class={ui.wgslToggle}
        classList={{ [ui.wgslToggleActive as string]: showWgsl() }}
        onClick={() => setShowWgsl((v) => !v)}
      >
        {showWgsl() ? '▼' : '▶'} Generated WGSL
      </button>

      <Show when={showWgsl() && generatedWgsl()}>
        <pre class={ui.wgslOutput}>{generatedWgsl()}</pre>
      </Show>
      <Show when={showWgsl() && !generatedWgsl()}>
        <div class={ui.wgslEmpty}>Enter math to see generated WGSL</div>
      </Show>
    </div>
  )
}
