import { autocompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, } from '@codemirror/commands'
import { bracketMatching, indentOnInput } from '@codemirror/language'
import { lintGutter, setDiagnostics } from '@codemirror/lint'
import { highlightSelectionMatches } from '@codemirror/search'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { createEffect, onCleanup, onMount } from 'solid-js'
import { wgslCompletions } from './autocomplete'
import { rainbowBracketPlugin } from './rainbowBrackets'
import { WGSL_SYNTAX_HIGHLIGHTING, wgslTheme } from './theme'
import { wgsl } from './wgslStreamParser'
import type { Diagnostic } from '@codemirror/lint'
import type { Accessor } from 'solid-js'

interface WgslEditorProps {
  code: string
  onChange: (code: string) => void
  readOnly?: boolean
  placeholder?: string
  diagnostics?: Accessor<readonly Diagnostic[]>
  onCtrlEnter?: () => void
}

export function WgslEditor(props: WgslEditorProps) {
  let containerRef: HTMLDivElement | undefined
  let view: EditorView | undefined
  let suppressOnChange = false

  onMount(() => {
    if (!containerRef) return

    const extensions = [
      wgsl(),
      lineNumbers(),
      lintGutter(),
      bracketMatching(),
      rainbowBracketPlugin,
      indentOnInput(),
      history(),
      highlightSelectionMatches(),
      autocompletion({ override: [wgslCompletions] }),
      EditorState.tabSize.of(2),
      EditorView.lineWrapping,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      wgslTheme,
      WGSL_SYNTAX_HIGHLIGHTING,
    ]

    if (props.readOnly) {
      extensions.push(EditorState.readOnly.of(true))
      extensions.push(EditorView.editable.of(false))
    }

    if (props.placeholder) {
      extensions.push(placeholder(props.placeholder))
    }

    if (props.onCtrlEnter) {
      const ctrlEnter = keymap.of([
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
      ])
      extensions.push(ctrlEnter)
    }

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !suppressOnChange) {
        const newCode = update.state.doc.toString()
        // Only fire if actually different
        if (newCode !== props.code) {
          props.onChange(newCode)
        }
      }
    })

    extensions.push(updateListener)

    const state = EditorState.create({
      doc: props.code,
      extensions,
    })

    view = new EditorView({
      state,
      parent: containerRef,
    })
  })

  // External code changes (loadExample, loadVariation, math→WGSL)
  createEffect(() => {
    const externalCode = props.code
    const v = view
    if (!v) return

    const currentDoc = v.state.doc.toString()
    if (externalCode !== currentDoc) {
      suppressOnChange = true
      v.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: externalCode,
        },
        selection: {
          anchor: Math.min(v.state.selection.main.anchor, externalCode.length),
          head: Math.min(v.state.selection.main.head, externalCode.length),
        },
      })
      suppressOnChange = false
    }
  })

  // Inline error diagnostics
  createEffect(() => {
    const v = view
    if (!v) return
    const diags = props.diagnostics?.()
    v.dispatch(setDiagnostics(v.state, diags ? [...diags] : []))
  })

  onCleanup(() => {
    view?.destroy()
    view = undefined
  })

  return <div ref={containerRef} style={{ height: '100%', overflow: 'auto' }} />
}
