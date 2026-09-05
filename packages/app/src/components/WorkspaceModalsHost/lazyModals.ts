import { createSignal, getOwner, runWithOwner } from 'solid-js'
import type { createShowBenchmark } from '@/components/BenchmarkModal/BenchmarkModal'
import type { createShowCustomVariationEditor } from '@/components/CustomVariationEditor/CustomVariationEditor'
import type { createDiscordShareModal } from '@/components/DiscordShareModal/DiscordShareModal'
import type { createShowDocumentation } from '@/components/DocumentationModal/DocumentationModal'
import type { createShowHelp, SidebarLayoutMode, } from '@/components/HelpModal/HelpModal'
import type { createImportVariationsModal } from '@/components/ImportVariationsModal/ImportVariationsModal'
import type { createLogoFaviconGenerator } from '@/components/LogoFaviconGenerator/LogoFaviconGenerator'
import type { createMigrationModal } from '@/components/Migration/Migration'
import type { QuickPickerMode } from '@/components/QuickVariationPicker/QuickVariationPicker'
import type { createShareLinkModal } from '@/components/ShareLinkModal/ShareLinkModal'
import type { createShareVariationLinkModal, createShareVariationLoadModal, } from '@/components/ShareVariationModal/ShareVariationModal'
import type { Theme } from '@/contexts/ThemeContext'
import type { Palette } from '@/flame/colorMap'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { CustomVariationDef } from '@/flame/variations/custom'
import type { HardwareTier } from '@/utils/hardwareTier'
import type { TimelineConfig, TimelineTrack } from '@/utils/timeline'

export function createLazyShowBenchmark() {
  const owner = getOwner()
  let instancePromise: Promise<ReturnType<typeof createShowBenchmark>> | null =
    null

  return async function showBenchmark(options?: { autoStart?: boolean }) {
    if (!instancePromise) {
      instancePromise =
        import('@/components/BenchmarkModal/BenchmarkModal').then(
          (m) => runWithOwner(owner, () => m.createShowBenchmark())!,
        )
    }
    const fn = await instancePromise
    return fn(options)
  }
}

export function createLazyShowDocumentation(opts: {
  hardwareTier: () => HardwareTier | null
}) {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createShowDocumentation>
  > | null = null

  return async function showDocumentation() {
    if (!instancePromise) {
      instancePromise =
        import('@/components/DocumentationModal/DocumentationModal').then(
          (m) => runWithOwner(owner, () => m.createShowDocumentation(opts))!,
        )
    }
    const fn = await instancePromise
    return fn()
  }
}

export function createLazyShowHelp(
  quickPickerMode: () => QuickPickerMode,
  onQuickPickerModeChange: (mode: QuickPickerMode) => void,
  sidebarLayoutMode: () => SidebarLayoutMode,
  onSidebarLayoutModeChange: (mode: SidebarLayoutMode) => void,
  isCompact: () => boolean,
  setCompact: (value: boolean) => void,
  theme: () => Theme,
  onThemeChange: (theme: Theme) => void,
  onInjectCrash?: () => void,
  hardwareTier?: () => HardwareTier | null,
  onHardwareTierChange?: (tier: HardwareTier) => void,
) {
  const owner = getOwner()
  let instancePromise: Promise<ReturnType<typeof createShowHelp>> | null = null

  return async function showHelp() {
    if (!instancePromise) {
      instancePromise = import('@/components/HelpModal/HelpModal').then(
        (m) =>
          runWithOwner(owner, () =>
            m.createShowHelp(
              quickPickerMode,
              onQuickPickerModeChange,
              sidebarLayoutMode,
              onSidebarLayoutModeChange,
              isCompact,
              setCompact,
              theme,
              onThemeChange,
              onInjectCrash,
              hardwareTier,
              onHardwareTierChange,
            ),
          )!,
      )
    }
    const fn = await instancePromise
    return fn()
  }
}

export function createLazyShowCustomVariationEditor() {
  const owner = getOwner()
  const [isOpen, setIsOpen] = createSignal(false)
  let instancePromise: Promise<
    ReturnType<typeof createShowCustomVariationEditor>
  > | null = null

  return {
    customVariationEditorIsOpen: isOpen,
    showCustomVariationEditor: async (existingDef?: CustomVariationDef) => {
      setIsOpen(true)
      try {
        if (!instancePromise) {
          instancePromise =
            import('@/components/CustomVariationEditor/CustomVariationEditor').then(
              (m) =>
                runWithOwner(owner, () => m.createShowCustomVariationEditor())!,
            )
        }
        const instance = await instancePromise
        return await instance.showCustomVariationEditor(existingDef)
      } finally {
        setIsOpen(false)
      }
    },
  }
}

export function createLazyLogoFaviconGenerator(
  flameDescriptor: FlameDescriptor,
  selectedPalette: () => Palette | undefined,
  loadIntoMainView: (flame: FlameDescriptor) => void,
) {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createLogoFaviconGenerator>
  > | null = null

  return {
    showLogoFaviconGenerator: async () => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/LogoFaviconGenerator/LogoFaviconGenerator').then(
            (m) =>
              runWithOwner(owner, () =>
                m.createLogoFaviconGenerator(
                  flameDescriptor,
                  selectedPalette,
                  loadIntoMainView,
                ),
              )!,
          )
      }
      const instance = await instancePromise
      return instance.showLogoFaviconGenerator()
    },
  }
}

export function createLazyShareLinkModal(
  flameDescriptor: FlameDescriptor,
  getTracks: () => TimelineTrack[],
  getConfig: () => TimelineConfig,
  captureOgImage?: () => Promise<Blob | null>,
) {
  const owner = getOwner()
  let instancePromise: Promise<ReturnType<typeof createShareLinkModal>> | null =
    null

  return {
    showShareLinkModal: async () => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/ShareLinkModal/ShareLinkModal').then(
            (m) =>
              runWithOwner(owner, () =>
                m.createShareLinkModal(
                  flameDescriptor,
                  getTracks,
                  getConfig,
                  captureOgImage,
                ),
              )!,
          )
      }
      const instance = await instancePromise
      return instance.showShareLinkModal()
    },
  }
}

export function createLazyDiscordShareModal() {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createDiscordShareModal>
  > | null = null

  return {
    showDiscordShareModal: async (
      opts: Parameters<
        ReturnType<typeof createDiscordShareModal>['showDiscordShareModal']
      >[0],
    ) => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/DiscordShareModal/DiscordShareModal').then(
            (m) => runWithOwner(owner, () => m.createDiscordShareModal())!,
          )
      }
      const instance = await instancePromise
      return instance.showDiscordShareModal(opts)
    },
  }
}

export function createLazyMigrationModal(
  loadIntoMainView: (flame: FlameDescriptor) => void,
) {
  const owner = getOwner()
  let instancePromise: Promise<ReturnType<typeof createMigrationModal>> | null =
    null

  return {
    showMigrationModal: async (currentFlame: FlameDescriptor) => {
      if (!instancePromise) {
        instancePromise = import('@/components/Migration/Migration').then(
          (m) =>
            runWithOwner(owner, () =>
              m.createMigrationModal(loadIntoMainView),
            )!,
        )
      }
      const instance = await instancePromise
      return instance.showMigrationModal(currentFlame)
    },
  }
}

export function createLazyImportVariationsModal() {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createImportVariationsModal>
  > | null = null

  return {
    showImportVariationsModal: async (
      imported: CustomVariationDef[],
      alreadyOwned: CustomVariationDef[] = [],
    ) => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/ImportVariationsModal/ImportVariationsModal').then(
            (m) => runWithOwner(owner, () => m.createImportVariationsModal())!,
          )
      }
      const instance = await instancePromise
      return instance.showImportVariationsModal(imported, alreadyOwned)
    },
  }
}

export function createLazyShareVariationLinkModal() {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createShareVariationLinkModal>
  > | null = null

  return {
    showShareVariationLinkModal: async (def: CustomVariationDef) => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/ShareVariationModal/ShareVariationModal').then(
            (m) =>
              runWithOwner(owner, () => m.createShareVariationLinkModal())!,
          )
      }
      const instance = await instancePromise
      return instance.showShareVariationLinkModal(def)
    },
  }
}

export function createLazyShareVariationLoadModal() {
  const owner = getOwner()
  let instancePromise: Promise<
    ReturnType<typeof createShareVariationLoadModal>
  > | null = null

  return {
    showShareVariationLoadModal: async (
      def: CustomVariationDef,
      alreadyOwned: boolean,
    ) => {
      if (!instancePromise) {
        instancePromise =
          import('@/components/ShareVariationModal/ShareVariationModal').then(
            (m) =>
              runWithOwner(owner, () => m.createShareVariationLoadModal())!,
          )
      }
      const instance = await instancePromise
      return instance.showShareVariationLoadModal(def, alreadyOwned)
    },
  }
}
