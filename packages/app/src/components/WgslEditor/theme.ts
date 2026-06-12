import { EditorView } from '@codemirror/view'

const bg = '#1a1b26'
const gutterBg = '#16161e'
const text = '#a9b1d6'
const cursor = '#c0caf5'
const selection = 'rgba(86, 148, 243, 0.3)'
const lineNum = '#3b4261'
const activeLine = 'rgba(255, 255, 255, 0.05)'

export const wgslTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: bg,
      color: text,
      height: '100%',
      fontSize: '0.8125rem',
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    },
    '.cm-content': {
      caretColor: cursor,
      fontFamily: 'inherit',
      padding: '0',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: cursor,
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: selection,
      },
    '.cm-gutters': {
      backgroundColor: gutterBg,
      color: lineNum,
      border: 'none',
      fontSize: '0.8125rem',
    },
    '.cm-gutter': {
      backgroundColor: gutterBg,
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 4px 0 8px',
      color: lineNum,
    },
    '.cm-activeLineGutter': {
      backgroundColor: gutterBg,
      color: '#545c7e',
    },
    '.cm-activeLine': {
      backgroundColor: activeLine,
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(86, 148, 243, 0.15)',
      color: '#7aa2f7',
      border: 'none',
    },
    '.cm-matchingBracket': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      outline: '1px solid rgba(255, 255, 255, 0.2)',
    },
    '.cm-nonmatchingBracket': {
      backgroundColor: 'rgba(255, 100, 100, 0.2)',
    },
    '.cm-selectionMatch': {
      backgroundColor: 'rgba(86, 148, 243, 0.15)',
      outline: '1px solid rgba(86, 148, 243, 0.3)',
    },
    '.cm-tooltip': {
      backgroundColor: '#1f2335',
      border: '1px solid #3b4261',
      color: text,
    },
    '.cm-tooltip-autocomplete': {
      '& .cm-completionIcon': {
        color: '#565f89',
      },
      '& .cm-completionLabel': {
        color: text,
      },
      '& .cm-completionDetail': {
        color: '#565f89',
        fontStyle: 'italic',
      },
      '& .cm-completionMatchedText': {
        color: '#7aa2f7',
        textDecoration: 'none',
      },
      '& li[aria-selected]': {
        backgroundColor: 'rgba(86, 148, 243, 0.25)',
        color: '#c0caf5',
      },
    },
  },
  { dark: true },
)

export const WGSL_SYNTAX_HIGHLIGHTING = EditorView.theme(
  {
    '.tok-keyword': { color: '#9d7cd8' },
    '.tok-type': { color: '#2ac3de' },
    '.tok-builtin': { color: '#7dcfff' },
    '.tok-comment': { color: '#565f89', fontStyle: 'italic' },
    '.tok-string': { color: '#9ece6a' },
    '.tok-number': { color: '#ff9e64' },
    '.tok-variableName': { color: '#c0caf5' },
  },
  { dark: true },
)
