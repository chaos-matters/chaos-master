import { afterEach, describe, expect, it, vi } from 'vitest'
import { activeTab, setActiveTab } from '@/lib/activeTab'
import { buildMoreMenu } from './moreMenuItems'

const LABELS = [
  'Save for later',
  'Export options',
  'Share link',
  'Advanced tools',
  'Lumen Arcade',
  'Documentation',
  'Quick GPU benchmark',
  'Benchmark Lab',
  'Deep zoom',
  'Settings and more',
  'Desktop layout',
]

describe('buildMoreMenu', () => {
  afterEach(() => {
    setActiveTab('workspace')
  })

  it('offers nothing a host cannot do, bar the Arcade', () => {
    // The Arcade is reachable from every touch surface and is the one
    // destination this phase does not put in the bar, so it defaults here
    // rather than being restated by each host - and the tablet's rail, the
    // host that did not restate it, was a dead end because of that.
    const items = buildMoreMenu({})
    expect(items.map((item) => item.label)).toEqual(['Lumen Arcade'])

    items[0]?.run()
    expect(activeTab()).toBe('arcade')
  })

  it('lists every item the host can do, in one order', () => {
    const handlers = {
      onSaveForLater: vi.fn(),
      onOpenExportModal: vi.fn(),
      onShare: vi.fn(),
      onOpenDrawer: vi.fn(),
      onOpenArcade: vi.fn(),
      onOpenDocs: vi.fn(),
      onOpenBenchmark: vi.fn(),
      onOpenBenchmarkLab: vi.fn(),
      onOpenExplorer: vi.fn(),
      onOpenSettings: vi.fn(),
      onDesktopLayout: vi.fn(),
    }
    const items = buildMoreMenu(handlers)
    expect(items.map((item) => item.label)).toEqual(LABELS)

    for (const item of items) item.run()
    for (const handler of Object.values(handlers)) {
      expect(handler).toHaveBeenCalledTimes(1)
    }
  })

  it('keeps the order when only some handlers are there', () => {
    const items = buildMoreMenu({
      onDesktopLayout: () => {},
      onShare: () => {},
    })
    expect(items.map((item) => item.label)).toEqual([
      'Share link',
      'Lumen Arcade',
      'Desktop layout',
    ])
  })

  it('offers the save the restore notice tells the user to make', () => {
    // The notice a launch shows when Recents could not take the restored
    // flame says to save it for later. That control lived on the desktop
    // layout's floating bar alone, and the draft it is about is only ever
    // read on native - so on the device the notice is written for there was
    // nothing to tap, and the same notice came back every launch.
    const onSaveForLater = vi.fn()
    const items = buildMoreMenu({ onSaveForLater })
    expect(items.map((item) => item.label)).toEqual([
      'Save for later',
      'Lumen Arcade',
    ])
    items[0]?.run()
    expect(onSaveForLater).toHaveBeenCalledTimes(1)
  })
})
