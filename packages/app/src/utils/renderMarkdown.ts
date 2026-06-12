import { marked } from 'marked'

type AdmonitionType = 'note' | 'info' | 'warn' | 'tip' | 'danger'

const ADMONITION_LABELS: Record<AdmonitionType, string> = {
  note: 'Note',
  info: 'Info',
  warn: 'Warning',
  tip: 'Tip',
  danger: 'Danger',
}

const ADMONITION_RE = /^:::(note|info|warn|tip|danger)\s*\n([\s\S]*?)^:::/gm

function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
}

export function renderMarkdown(text: string): string {
  const mathBlocks: string[] = []
  const mathInlines: string[] = []
  const admonitions: Array<{ type: AdmonitionType; content: string }> = []
  let placeholderIndex = 0

  // Extract $$...$$ display math blocks first
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_full, tex: string) => {
    const idx = mathBlocks.length
    mathBlocks.push(tex.trim())
    return `<mathblock id="${idx}"></mathblock>`
  })

  // Extract \(...\) inline math blocks
  processed = processed.replace(/\\\(([^)]+?)\\\)/g, (_full, tex: string) => {
    const idx = mathInlines.length
    mathInlines.push(tex.trim())
    return `<mathinline id="${idx}"></mathinline>`
  })

  // Extract admonition blocks and replace with placeholders
  processed = processed.replace(
    ADMONITION_RE,
    (_full, type: string, content: string) => {
      const idx = placeholderIndex++
      admonitions.push({
        type: type as AdmonitionType,
        content: content.trim(),
      })
      return `\n<admonition id="${idx}"></admonition>\n`
    },
  )

  // String.raw in tutorial content produces \` (escaped backtick) which
  // markdown treats as a literal backtick instead of a code-span delimiter.
  processed = processed.replace(/\\`/g, '`')

  let html = marked.parse(processed) as string

  // Restore math blocks (before admonitions, since admonitions may contain math)
  for (let i = 0; i < mathBlocks.length; i++) {
    html = html.replace(
      `<mathblock id="${i}"></mathblock>`,
      `<div class="math-block" data-tex="${escapeAttr(mathBlocks[i]!)}">${escapeHtml(mathBlocks[i]!)}</div>`,
    )
  }

  for (let i = 0; i < mathInlines.length; i++) {
    html = html.replace(
      `<mathinline id="${i}"></mathinline>`,
      `<span class="math-inline" data-tex="${escapeAttr(mathInlines[i]!)}">${escapeHtml(mathInlines[i]!)}</span>`,
    )
  }

  // Restore admonitions with styled divs
  for (let i = 0; i < admonitions.length; i++) {
    const { type, content: rawContent } = admonitions[i]!
    const content = rawContent.replace(/\\`/g, '`')
    const renderedContent = marked.parse(content) as string
    const label = ADMONITION_LABELS[type]
    html = html.replace(
      `<admonition id="${i}"></admonition>`,
      `<div class="admonition admonition${type.charAt(0).toUpperCase() + type.slice(1)}"><div class="admonitionHeader">${label}</div><div class="admonitionContent">${renderedContent}</div></div>`,
    )
  }

  return sanitize(html)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
