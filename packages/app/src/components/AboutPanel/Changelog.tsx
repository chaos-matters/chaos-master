import { createResource, For, Show } from 'solid-js'
import { useRequestModal } from '../Modal/ModalContext'
import { ModalTitleBar } from '../Modal/ModalTitleBar'
import ui from './Changelog.module.css'

type ChangelogEntry = {
  version: string
  date: string
  sections: {
    title: string
    items: string[]
  }[]
}

async function fetchChangelog(): Promise<ChangelogEntry[]> {
  const response = await fetch('/CHANGELOG.md')
  const text = await response.text()

  const entries: ChangelogEntry[] = []
  const lines = text.split('\n')

  let currentEntry: ChangelogEntry | null = null
  let currentSection: { title: string; items: string[] } | null = null

  for (const line of lines) {
    const versionMatch = line.match(/^## \[([\d.]+)\] - ([\d-]+)/)
    if (versionMatch) {
      currentEntry = {
        version: versionMatch[1],
        date: versionMatch[2],
        sections: [],
      }
      entries.push(currentEntry)
      currentSection = null
      continue
    }

    if (currentEntry) {
      const sectionMatch = line.match(/^### (\w+)/)
      if (sectionMatch) {
        currentSection = {
          title: sectionMatch[1],
          items: [],
        }
        currentEntry.sections.push(currentSection)
        continue
      }

      if (currentSection) {
        const itemMatch = line.match(/^- (.*)/)
        if (itemMatch) {
          currentSection.items.push(itemMatch[1])
        }
      }
    }
  }

  return entries
}

type ChangelogProps = {
  respond: () => void
}

export function Changelog(props: ChangelogProps) {
  const [entries] = createResource(fetchChangelog)

  return (
    <div class={ui.changelogContainer}>
      <ModalTitleBar
        onClose={() => {
          props.respond()
        }}
      >
        <span>Changelog</span>
      </ModalTitleBar>
      <div class={ui.content}>
        <Show when={!entries.loading} fallback={<div>Loading...</div>}>
          <For each={entries()}>
            {(entry) => (
              <div class={ui.entry}>
                <h3 class={ui.versionHeader}>
                  <span class={ui.version}>v{entry.version}</span>
                  <span class={ui.date}>{entry.date}</span>
                </h3>
                <For each={entry.sections}>
                  {(section) => (
                    <div class={ui.section}>
                      <h4 class={ui.sectionTitle}>{section.title}</h4>
                      <ul class={ui.list}>
                        <For each={section.items}>
                          {(item) => <li class={ui.item}>{item}</li>}
                        </For>
                      </ul>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  )
}

export function createShowChangelog() {
  const requestModal = useRequestModal()

  async function showChangelog() {
    await requestModal({
      class: ui.changelogModal,
      content: ({ respond }) => <Changelog respond={respond} />,
    })
  }

  return showChangelog
}
