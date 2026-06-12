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
