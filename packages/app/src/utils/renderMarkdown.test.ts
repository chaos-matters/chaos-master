import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './renderMarkdown'

describe('renderMarkdown inline math', () => {
  it('restores inline math inside a table cell (no leaked placeholder)', () => {
    const md = `| Function | Description |
|----------|-------------|
| \`\\exp(x)\` | Exponential \\(e^x\\) |
| \`x^y\` | Power \\(x^y\\) |`
    const html = renderMarkdown(md)
    // Both inline maths become spans...
    expect(html).toContain('<span class="math-inline" data-tex="e^x">')
    expect(html).toContain('<span class="math-inline" data-tex="x^y">')
    // ...and no raw placeholder (tag or token) leaks into the output.
    expect(html).not.toContain('mathinline')
    expect(html).not.toContain('xMjx')
  })

  it('restores inline math within a paragraph', () => {
    const html = renderMarkdown('Euler gives \\(e^x\\) growth.')
    expect(html).toContain('<span class="math-inline" data-tex="e^x">')
    expect(html).not.toContain('xMjx')
  })
})
