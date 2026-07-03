import { createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'

/** Track-name column width per viewport, matching DopeSheet.module.css's
 *  responsive font sizing. This is the single source of truth for the column:
 *  every piece of horizontal-alignment math (ruler spacer, tracks playhead
 *  offset, curve gutter, auto-fit) AND the rendered cells consume this value,
 *  so the ruler's frame axis can never shift against the lanes when a CSS
 *  breakpoint kicks in. */
const WIDTHS = [
  { query: '(max-width: 480px)', width: 80 },
  { query: '(max-width: 768px)', width: 100 },
] as const

const DEFAULT_WIDTH = 130

export function useTrackNameWidth(): Accessor<number> {
  const lists = WIDTHS.map(({ query, width }) => ({
    mq: window.matchMedia(query),
    width,
  }))
  const compute = () =>
    lists.find(({ mq }) => mq.matches)?.width ?? DEFAULT_WIDTH

  const [width, setWidth] = createSignal(compute())
  const update = () => setWidth(compute())
  for (const { mq } of lists) {
    mq.addEventListener('change', update)
  }
  onCleanup(() => {
    for (const { mq } of lists) {
      mq.removeEventListener('change', update)
    }
  })
  return width
}
