// @vitest-environment jsdom
// DOMPurify needs a spec-faithful DOM to sanitize correctly. The workspace
// default (happy-dom) mis-handles <script>/<svg> stripping here, so this file
// pins jsdom — the environment DOMPurify is developed and tested against.
import { describe, expect, it } from 'vitest'
import { sanitizeRichHtml } from './sanitizeHtml'

describe('sanitizeRichHtml', () => {
  it('strips <script> tags', () => {
    const out = sanitizeRichHtml('<p>hi</p><script>alert(1)</script>')
    expect(out).not.toMatch(/<script/i)
    expect(out).toContain('hi')
  })

  it('strips inline event-handler attributes', () => {
    const out = sanitizeRichHtml('<img src="x" onerror="alert(1)">')
    expect(out).not.toMatch(/onerror/i)
  })

  it('strips javascript: hrefs', () => {
    const out = sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })

  it('neutralizes an SVG onload handler', () => {
    const out = sanitizeRichHtml('<svg onload="alert(1)"></svg>')
    expect(out).not.toMatch(/onload/i)
  })

  it('preserves benign MathJax-style SVG markup', () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"></path></svg>'
    const out = sanitizeRichHtml(svg)
    expect(out).toContain('<svg')
    expect(out).toContain('<path')
  })

  it('preserves plain formatted markup', () => {
    const out = sanitizeRichHtml(
      '<p><strong>bold</strong> and <em>italic</em></p>',
    )
    expect(out).toContain('<strong>')
    expect(out).toContain('<em>')
  })
})
