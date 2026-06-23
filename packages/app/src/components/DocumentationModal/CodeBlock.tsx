import ui from './DocumentationModal.module.css'

/** Read-only, scrollable code display for the doc modal (TS source / WGSL). */
export function CodeBlock(props: { code: string }) {
  return (
    <pre class={ui.codeBlock}>
      <code>{props.code}</code>
    </pre>
  )
}
