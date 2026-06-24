// eslint-disable-next-line import-x/no-named-as-default -- dompurify's default export is the API instance
import DOMPurify from 'dompurify'

/**
 * Sanitize rich HTML before assigning it to an `innerHTML` sink.
 *
 * Permits the SVG/MathML that MathJax emits and the inline HTML the markdown
 * renderer produces, while stripping `<script>`, event-handler attributes, and
 * other active content. Defense-in-depth: these sinks currently render
 * app-authored tutorial/markdown content and MathJax output, but sanitizing
 * keeps them safe if the rendered input ever becomes user-controlled.
 */
export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
  })
}
