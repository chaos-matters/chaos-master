import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { Book, GridIcon, Info, Menu, SidebarPanel, Star, Zap } from '@/icons'
import { setActiveTab } from '@/lib/activeTab'
import { BENCHMARKS_PATH } from '@/routing/appPath'
import { isTouchLayout as globalIsTouchLayout, setTouchLayoutPreference as globalSetTouchLayoutPref, } from '@/stores/workspaceLayoutStore'
import { VERSION } from '@/version'
import { BenchmarkButton } from '../BenchmarkButton/BenchmarkButton'
import { DebugPanel } from '../Debug/DebugPanel'
import ui from './SoftwareVersion.module.css'
import type { TouchLayoutPreference } from '@/stores/workspaceLayoutStore'

export interface SoftwareVersionProps {
  showHelp: () => void
  showDocs: () => void
  showBenchmark: () => void
  touchLayoutPreference?: () => TouchLayoutPreference
  setTouchLayoutPreference?: (pref: TouchLayoutPreference) => void
  isTouchLayout?: () => boolean
  onPickGallery?: () => void
}

export function SoftwareVersion(props: SoftwareVersionProps) {
  const [open, setOpen] = createSignal(false)
  const isTouch = () =>
    props.isTouchLayout ? props.isTouchLayout() : globalIsTouchLayout()
  const setTouchPref = (pref: TouchLayoutPreference) => {
    if (props.setTouchLayoutPreference) {
      props.setTouchLayoutPreference(pref)
    } else {
      globalSetTouchLayoutPref(pref)
    }
  }

  createEffect(() => {
    if (!open() || typeof window === 'undefined') return
    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    onCleanup(() => {
      window.removeEventListener('keydown', handleKeyDown)
    })
  })

  return (
    <div>
      <DebugPanel />
      <Show
        when={isTouch()}
        fallback={
          <div class={ui.desktopContainer}>
            <BenchmarkButton onClick={props.showBenchmark} />
            <a
              class={ui.benchmarkLabPill}
              href={BENCHMARKS_PATH}
              aria-label="Open Benchmark Lab"
              title="Open Benchmark Lab"
            >
              <GridIcon class={ui.pillIcon} />
              Lab
            </a>
            <a
              class={ui.arcadePill}
              href="#arcade"
              aria-label="Open Lumen Arcade"
              title="Open Lumen Arcade"
              onClick={(ev) => {
                ev.preventDefault()
                setActiveTab('arcade')
              }}
            >
              <Star class={ui.pillIcon} />
              Arcade
            </a>
            <button
              type="button"
              class={ui.docsPill}
              onClick={props.showDocs}
              title="Documentation"
            >
              <Book class={ui.pillIcon} />
              Docs
            </button>
            <button
              type="button"
              class={ui.aboutPill}
              onClick={props.showHelp}
              aria-label={`About Chaos Master v${VERSION}`}
              title={`About Chaos Master v${VERSION}`}
            >
              <Info class={ui.pillIcon} />v{VERSION}
            </button>
            <button
              type="button"
              class={ui.layoutPill}
              onClick={() => {
                setTouchPref('touch')
              }}
              title="Switch to Touch Studio"
              aria-label="Switch to Touch Studio"
            >
              <SidebarPanel class={ui.pillIcon} />
              Touch
            </button>
          </div>
        }
      >
        <div class={ui.touchContainer}>
          <Show when={open()}>
            <div
              class={ui.popoverBackdrop}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              class={ui.menuPopover}
              role="menu"
              aria-label="Chaos Master menu"
            >
              <button
                type="button"
                role="menuitem"
                class={`${ui.menuItem} ${ui.menuItemHighlight}`}
                onClick={() => {
                  setTouchPref('desktop')
                  setOpen(false)
                }}
              >
                <SidebarPanel class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>Switch to Desktop Layout</span>
                  <span class={ui.menuSub}>Sidebar, dock & inspector</span>
                </div>
              </button>
              <Show when={props.onPickGallery}>
                <button
                  type="button"
                  role="menuitem"
                  class={`${ui.menuItem} ${ui.menuItemHighlight}`}
                  onClick={() => {
                    props.onPickGallery?.()
                    setOpen(false)
                  }}
                >
                  <GridIcon class={ui.menuIcon} />
                  <div class={ui.menuMeta}>
                    <span class={ui.menuLabel}>Browse Flame Gallery</span>
                    <span class={ui.menuSub}>
                      Search & load presets or community
                    </span>
                  </div>
                </button>
              </Show>
              <div class={ui.menuDivider} />

              <a
                class={`${ui.menuItem} ${ui.arcadePill}`}
                href="#arcade"
                role="menuitem"
                aria-label="Open Lumen Arcade"
                onClick={(ev) => {
                  ev.preventDefault()
                  setActiveTab('arcade')
                  setOpen(false)
                }}
              >
                <Star class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>Lumen Arcade</span>
                  <span class={ui.menuSub}>Interactive lessons & duels</span>
                </div>
              </a>

              <a
                class={`${ui.menuItem} ${ui.benchmarkLabPill}`}
                href={BENCHMARKS_PATH}
                role="menuitem"
                aria-label="Open Benchmark Lab"
                onClick={() => setOpen(false)}
              >
                <GridIcon class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>Benchmark Lab</span>
                  <span class={ui.menuSub}>Fractal performance lab</span>
                </div>
              </a>

              <button
                type="button"
                class={ui.menuItem}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  props.showBenchmark()
                }}
              >
                <Zap class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>Quick GPU Benchmark</span>
                  <span class={ui.menuSub}>Run hardware speed test</span>
                </div>
              </button>

              <button
                type="button"
                class={`${ui.menuItem} ${ui.docsPill}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  props.showDocs()
                }}
              >
                <Book class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>Documentation</span>
                  <span class={ui.menuSub}>User guide & references</span>
                </div>
              </button>

              <button
                type="button"
                class={`${ui.menuItem} ${ui.aboutPill}`}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  props.showHelp()
                }}
              >
                <Info class={ui.menuIcon} />
                <div class={ui.menuMeta}>
                  <span class={ui.menuLabel}>About Chaos Master</span>
                  <span class={ui.menuSub}>v{VERSION}</span>
                </div>
              </button>
            </div>
          </Show>

          <button
            type="button"
            class={ui.menuTrigger}
            classList={{ [ui.menuTriggerActive as string]: open() }}
            onClick={() => setOpen(!open())}
            aria-expanded={open()}
            aria-haspopup="menu"
            aria-label="Chaos Master menu"
            title="Chaos Master menu"
          >
            <Menu class={ui.triggerIcon} />
          </button>
        </div>
      </Show>
    </div>
  )
}
