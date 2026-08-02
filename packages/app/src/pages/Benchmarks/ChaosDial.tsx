import { For } from 'solid-js'
import ui from './BenchmarksPage.module.css'

export type BenchmarkAlgorithm = 'compare' | 'current' | 'mitchell'

const OPTIONS: readonly {
  id: BenchmarkAlgorithm
  label: string
  short: string
  hint: string
}[] = [
  {
    id: 'current',
    label: 'Current renderer',
    short: 'Current',
    hint: 'Direct point accumulation',
  },
  {
    id: 'mitchell',
    label: 'Mitchell–Netravali',
    short: 'M–N',
    hint: 'Stochastic cubic reconstruction',
  },
  {
    id: 'compare',
    label: 'Current versus Mitchell–Netravali',
    short: 'A/B',
    hint: 'Balanced paired comparison',
  },
]

export function ChaosDial(props: {
  value: BenchmarkAlgorithm
  onChange: (value: BenchmarkAlgorithm) => void
  disabled?: boolean
}) {
  const optionButtons: Array<HTMLButtonElement | undefined> = []
  const selected = () => OPTIONS.find((option) => option.id === props.value)!

  function selectAndFocus(index: number) {
    const wrappedIndex = (index + OPTIONS.length) % OPTIONS.length
    const option = OPTIONS[wrappedIndex]
    if (!option) return

    props.onChange(option.id)
    optionButtons[wrappedIndex]?.focus()
  }

  function handleOptionKeyDown(event: KeyboardEvent, index: number) {
    let nextIndex: number

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = index + 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = index - 1
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = OPTIONS.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    selectAndFocus(nextIndex)
  }

  return (
    <div class={ui.dialWrap}>
      <div class={ui.dial} role="radiogroup" aria-label="Renderer algorithm">
        <svg class={ui.dialTrace} viewBox="0 0 240 240" aria-hidden="true">
          <circle cx="120" cy="120" r="93" />
          <path d="M120 27 C176 27 213 73 213 120" />
          <path d="M213 120 C213 174 174 213 120 213" />
          <path d="M120 213 C68 213 27 175 27 120 C27 72 67 27 120 27" />
        </svg>
        <div class={ui.dialCore}>
          <span>RENDER</span>
          <strong>{selected().short}</strong>
          <small>{selected().hint}</small>
        </div>
        <For each={OPTIONS}>
          {(option, index) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.value === option.id}
              aria-label={option.label}
              tabIndex={props.value === option.id ? 0 : -1}
              class={ui.dialOption}
              classList={{
                [ui.dialOptionActive!]: props.value === option.id,
                [ui[`dialOption${index() + 1}`]!]: true,
              }}
              disabled={props.disabled}
              ref={(element) => {
                optionButtons[index()] = element
              }}
              onClick={() => {
                props.onChange(option.id)
              }}
              onKeyDown={(event) => {
                handleOptionKeyDown(event, index())
              }}
            >
              {option.short}
            </button>
          )}
        </For>
      </div>
      <div class={ui.dialLegend} aria-hidden="true">
        <For each={OPTIONS}>
          {(option) => (
            <span classList={{ [ui.legendActive!]: props.value === option.id }}>
              {option.label}
            </span>
          )}
        </For>
      </div>
    </div>
  )
}
