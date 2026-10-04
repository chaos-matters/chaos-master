import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { Book, DeepZoom, GridIcon, Info, Menu, SidebarPanel, Star, Zap, } from '@/icons'
import { setActiveTab } from '@/lib/activeTab'
import { BENCHMARKS_PATH, EXPLORER_PATH } from '@/routing/appPath'
import { isTouchLayout as globalIsTouchLayout, setTouchLayoutPreference as globalSetTouchLayoutPref, } from '@/stores/workspaceLayoutStore'
import { DISPLAY_VERSION } from '@/version'
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
  /**
   * True on every touch layout. Each one already offers this list from a More
   * menu of its own (Shell/moreMenuItems.ts), and the floating trigger has
   * nowhere to sit that is not on top of one: under the phone's top bar, or
   * over the first two items of the tablet's navigation rail.
   */
  hideTrigger?: () => boolean
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

  const renderMenuItems = (touch: boolean) => (
    <>
      <button
        type="button"
        role="menuitem"
        class={`${ui.menuItem} ${ui.menuItemHighlight}`}
        onClick={() => {
          setTouchPref(touch ? 'desktop' : 'touch')
          setOpen(false)
        }}
      >
        <SidebarPanel class={ui.menuIcon} />
        <div class={ui.menuMeta}>
          <span class={ui.menuLabel}>
            {touch ? 'Switch to Desktop Layout' : 'Switch to Touch Studio'}
          </span>
          <span class={ui.menuSub}>
            {touch
              ? 'Sidebar, dock & inspector'
              : 'Touch-optimized mobile/tablet UI'}
          </span>
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
            <span class={ui.menuSub}>Search & load presets or community</span>
          </div>
        </button>
      </Show>
      <div class={ui.menuDivider} />

      <a
        class={`${ui.menuItem} ${ui.arcadePill}`}
        href="#arcade"
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
        aria-label="Open Benchmark Lab"
        onClick={() => setOpen(false)}
      >
        <GridIcon class={ui.menuIcon} />
        <div class={ui.menuMeta}>
          <span class={ui.menuLabel}>Benchmark Lab</span>
          <span class={ui.menuSub}>Fractal performance lab</span>
        </div>
      </a>

      <a
        class={ui.menuItem}
        href={EXPLORER_PATH}
        aria-label="Open the deep-zoom explorer"
        onClick={() => setOpen(false)}
      >
        <DeepZoom class={ui.menuIcon} />
        <div class={ui.menuMeta}>
          <span class={ui.menuLabel}>Deep zoom</span>
          <span class={ui.menuSub}>Mandelbrot and Julia explorer</span>
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
          <span class={ui.menuLabel}>Settings and More</span>
          <span class={ui.menuSub}>
            Preferences, about & v{DISPLAY_VERSION}
          </span>
        </div>
      </button>
    </>
  )

  return (
    <div>
      <DebugPanel />
      <Show when={!props.hideTrigger?.()}>
        <Show
          when={isTouch()}
          fallback={
            <div class={ui.desktopContainer}>
              <Show when={open()}>
                <div
                  class={ui.popoverBackdrop}
                  onClick={() => setOpen(false)}
                  aria-hidden="true"
                />
                <div
                  class={ui.menuPopoverUp}
                  role="menu"
                  aria-label="Lumen Apeiron menu"
                >
                  {renderMenuItems(false)}
                </div>
              </Show>

              <button
                type="button"
                class={ui.desktopTrigger}
                classList={{ [ui.desktopTriggerActive as string]: open() }}
                onClick={() => setOpen(!open())}
                aria-expanded={open()}
                aria-haspopup="menu"
                aria-label={`Lumen Apeiron v${DISPLAY_VERSION} menu`}
                title={`Lumen Apeiron v${DISPLAY_VERSION} menu`}
              >
                <Info class={ui.pillIcon} />
                <span>v{DISPLAY_VERSION}</span>
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
                aria-label="Lumen Apeiron menu"
              >
                {renderMenuItems(true)}
              </div>
            </Show>

            <button
              type="button"
              class={ui.menuTrigger}
              classList={{ [ui.menuTriggerActive as string]: open() }}
              onClick={() => setOpen(!open())}
              aria-expanded={open()}
              aria-haspopup="menu"
              aria-label="Lumen Apeiron menu"
              title="Lumen Apeiron menu"
            >
              <Menu class={ui.triggerIcon} />
            </button>
          </div>
        </Show>
      </Show>
    </div>
  )
}
