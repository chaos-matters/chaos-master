import { Decoration, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, EditorView, ViewUpdate } from '@codemirror/view'

const BRACKET_COLORS = [
  '#7dcfff',
  '#9d7cd8',
  '#ff9e64',
  '#2ac3de',
  '#9ece6a',
  '#e0af68',
  '#bb9af7',
  '#f7768e',
]

const BRACKET_PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
}

const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS))
const OPENING_BRACKETS = new Set(Object.keys(BRACKET_PAIRS))

function rainbowBrackets(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; value: Decoration }[] = []
  const text = view.state.doc.toString()
  const depthStack: { pos: number; char: string }[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!ch) continue
    if (OPENING_BRACKETS.has(ch)) {
      depthStack.push({ pos: i, char: ch })
    } else if (CLOSING_BRACKETS.has(ch)) {
      const opener = depthStack.pop()
      if (!opener || BRACKET_PAIRS[opener.char] !== ch) continue
      const depth = depthStack.length
      const color = BRACKET_COLORS[depth % BRACKET_COLORS.length]
      decorations.push({
        from: opener.pos,
        to: opener.pos + 1,
        value: Decoration.mark({ attributes: { style: `color: ${color}` } }),
      })
      decorations.push({
        from: i,
        to: i + 1,
        value: Decoration.mark({ attributes: { style: `color: ${color}` } }),
      })
    }
  }

  return Decoration.set(decorations, true)
}

export const rainbowBracketPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = rainbowBrackets(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = rainbowBrackets(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
