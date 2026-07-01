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

describe('renderMarkdown sanitize', () => {
  it('strips <script> tags', () => {
    const html = renderMarkdown('<script>alert(1)</script>hello')
    expect(html).not.toContain('<script')
  })

  it('strips double-quoted event-handler attributes', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">')
    expect(html).not.toContain('onerror')
  })

  it('strips single-quoted event-handler attributes', () => {
    const html = renderMarkdown("<img src='x' onerror='alert(1)'>")
    expect(html).not.toContain('onerror')
  })

  it('strips unquoted event-handler attributes', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>')
    expect(html).not.toContain('onerror')
  })

  it('neutralizes javascript: hrefs', () => {
    const html = renderMarkdown('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toContain('javascript:')
  })
})
