interface MathJaxInstance {
  tex2svg: (tex: string) => Document
  startup?: {
    document?: unknown
    defaultReady?: () => void
    promise?: Promise<void>
    ready?: () => void
  }
  loader?: { load: (ids: string[]) => void }
  config?: { loader?: { load?: string[] } }
}

export function getMathJax(): MathJaxInstance | undefined {
  return (window as { MathJax?: MathJaxInstance }).MathJax
}

let mathjaxReady: Promise<void> | null = null

export function ensureMathJax(): Promise<void> {
  if (mathjaxReady) return mathjaxReady
  // MathJax 4 boots an SRE speech Web Worker (mathjax/sre/speech-worker.js) to
  // generate screen-reader speech. Its path doesn't resolve under our bundler,
  // so it throws a console NetworkError on every render. We render math visually
  // (SVG) and don't surface MathJax's a11y menu, so this is pure noise.
  //
  // The worker is spun up by the `attachSpeech` render action — and the
  // document-level enableSpeech/enableBraille options do NOT gate it (those flags
  // live on the a11y/menu layer). Clearing the render action removes the worker
  // outright. Config is read when the component is imported, so set it first.
  const w = window as unknown as { MathJax?: Record<string, unknown> }
  w.MathJax = {
    ...(w.MathJax ?? {}),
    svg: {
      ...(w.MathJax?.svg ?? {}),
      // Inline glyph paths instead of emitting <use> references into a shared
      // <defs> cache. The default ('local') makes each SVG depend on its own
      // <defs> by id — fragile once the SVG's outerHTML is concatenated with
      // others into a single innerHTML container and run through DOMPurify: the
      // <use> references dangle and the equation collapses to just its rule
      // lines. 'none' makes every SVG fully self-contained, so it survives both.
      fontCache: 'none',
    },
    options: {
      ...(w.MathJax?.options ?? {}),
      enableSpeech: false,
      enableBraille: false,
      enableEnrichment: false,
      // Disabling this single render action stops `getWebworker()` from ever
      // running. `[]` is MathJax's documented way to turn a render action off.
      renderActions: { attachSpeech: [] },
    },
  }
  mathjaxReady = import('mathjax/tex-svg.js').then(() => {
    const mj = getMathJax()
    if (!mj) throw new Error('MathJax failed to initialize')
    if (!mj.startup?.document) {
      return new Promise<void>((resolve) => {
        mj.startup = {
          ...mj.startup,
          ready() {
            mj.startup?.defaultReady?.()
            mj.startup?.promise
              ?.then(() => {
                resolve()
              })
              .catch(() => {})
          },
        }
        if (mj.loader) mj.loader.load(mj.config?.loader?.load ?? [])
        else resolve()
      })
    }
  })
  return mathjaxReady
}

export function renderTexToSvg(tex: string, display = true): string | null {
  const mj = getMathJax()
  if (!mj?.startup?.document) return null
  try {
    const wrapped = display ? `\\displaystyle{${tex}}` : tex
    const doc = mj.tex2svg(wrapped)
    const svg = doc.querySelector('svg')
    return svg ? svg.outerHTML : null
  } catch {
    return null
  }
}
