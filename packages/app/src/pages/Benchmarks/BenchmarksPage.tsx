import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, } from 'solid-js'
import { BENCHMARK_COMPARISON_VERDICT_LABELS, BENCHMARK_MANIFEST_SCHEMA_VERSION, BENCHMARK_RESULT_SCHEMA_VERSION, BENCHMARK_SAMPLE_SCHEMA_VERSION, benchmarkFlameDigest, benchmarkSourceDigest, clearBenchmarkResultHistory, createBalancedComparisonSchedule, createBenchmarkCsvExport, createBenchmarkJsonExport, createRngBenchmarkImplementation, createSeededSurpriseFlame, createSingleCandidateSchedule, deleteBenchmarkResult, deriveBenchmarkCandidateSummaries, deriveBenchmarkComparison, listAncestryBenchmarkFlames, listBuiltinBenchmarkFlames, listRecentBenchmarkFlames, loadBenchmarkResultHistory, parseBenchmarkFlameUpload, RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION, RNG_IMPLEMENTATION_IDS, RNG_IMPLEMENTATION_LIST, RNG_SEED_POLICY_IDS, saveBenchmarkResult, toBenchmarkFlameV1, validateBenchmarkManifest, validateBenchmarkResult, } from '@/benchmarks'
import { createShowBenchmark } from '@/components/BenchmarkModal/BenchmarkModal'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { WgslEditor } from '@/components/WgslEditor'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { useToast } from '@/contexts/ToastContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { getAncestryNodes, initAncestry } from '@/flame/ancestry'
import { compileCustomVariationCode, previewCustomVariation, } from '@/flame/variations/custom'
import { getVariationDoc } from '@/flame/variations/docs'
import { gpuStatus } from '@/lib/gpuStatus'
import { useRootContext } from '@/lib/RootContext'
import { deepClone } from '@/utils/clone'
import { useElementIsScrolling } from '@/utils/isScrolling'
import { createSharedIntersectionObserver } from '@/utils/useIntersectionObserver'
import { GIT_SHA, VERSION } from '@/version'
import { BENCHMARK_DIAL, BENCHMARK_DIAL_EMBER_ARC, BENCHMARK_DIAL_EMBER_NODES, drawBenchmarkDialGeometry, } from './benchmarkDialGeometry'
import { BenchmarkRunnerHost } from './BenchmarkRunnerHost'
import ui from './BenchmarksPage.module.css'
import { ChaosDial } from './ChaosDial'
import { FractalDivider } from './FractalDivider'
import type { BenchmarkHostResult } from './BenchmarkRunnerHost'
import type { BenchmarkAlgorithm } from './ChaosDial'
import type { BenchmarkCandidateV1, BenchmarkCompilationV1, BenchmarkCorrectnessStatus, BenchmarkFlameSourceDescriptor, BenchmarkImplementationV1, BenchmarkManifestV1, BenchmarkResultHistoryEntry, BenchmarkResultV1, BenchmarkSampleV1, BenchmarkScheduleEntryV1, BenchmarkTextExport, RngImplementationId, } from '@/benchmarks'
import type { PointInitMode } from '@/flame/pointInitMode'
import type { FlameDescriptor, VariationId } from '@/flame/schema/flameSchema'
import type { RendererRandomImplementationId } from '@/shaders/random'

/*
THESIS: A precise creative-performance instrument, not a generic gaming dashboard.
OWN-WORLD: Graphite surfaces, incumbent Inter, ember reference, cyan candidate,
restrained controls, one Chaos Dial, and deterministic flame-bifurcation rules.
STORY: Choose the local profile and frozen flame corpus; optionally author a
variation candidate; run a reproducible comparison; inspect speed, stability,
and correctness evidence.
FIRST VIEWPORT: Slim product header and section rail; setup/dial beside an
explicit frozen-run manifest; corpus follows; run action stays easy to find.
FORM: Operate mode in the established Lumen Apeiron world, implementing the
approved benchmark plan and using the prior fractal concept exploration only as
direction—not as decorative noise.
*/

type SourceTab = 'ancestry' | 'builtins' | 'generated' | 'recent' | 'uploads'
type ProtocolId = 'quick' | 'rigorous' | 'standard'
type CompileState =
  | { status: 'dirty' | 'idle'; message: string; elapsedMs?: undefined }
  | { status: 'invalid'; message: string; elapsedMs: number }
  | { status: 'valid'; message: string; elapsedMs: number }

type LabSettings = {
  pointInitMode: PointInitMode
  plotsPerChain: number
  skipIters: number
  persistChains: boolean
  resolution: number
  pointCountPerBatch: number
}

type CandidateRuntime = {
  candidate: BenchmarkCandidateV1
  flame: FlameDescriptor
  stochasticFilterEnabled: boolean
  randomImplementationId: RendererRandomImplementationId
}

type ActiveSample = {
  key: string
  flame: FlameDescriptor
  stochasticFilterEnabled: boolean
  randomImplementationId: RendererRandomImplementationId
  minimumCompletedPoints: number
  minimumElapsedMs: number
  maximumElapsedMs: number
  pointCountPerBatch: number
  resolution: number
  persistChains: boolean
  onComplete: (result: BenchmarkHostResult) => void
  onError: (error: unknown) => void
  onProgress: (result: BenchmarkHostResult) => void
}

type CompletedLabRun = {
  manifest: BenchmarkManifestV1
  result: BenchmarkResultV1
}

type RunProgress = {
  completedSamples: number
  totalSamples: number
  flameLabel: string
  candidateLabel: string
  pointsPerSecond?: number
}

type VariationTemplate = {
  id: 'linear' | 'sinusoidal' | 'spherical'
  label: string
  variationType: 'linearVar' | 'sinusoidalVar' | 'sphericalVar'
  body: string
}

const PROTOCOLS: Readonly<
  Record<
    ProtocolId,
    {
      label: string
      warmupPairs: number
      measuredPairs: number
      minimumCompletedPoints: number
      minimumElapsedMs: number
      maximumElapsedMs: number
      note: string
    }
  >
> = {
  quick: {
    label: 'Quick',
    warmupPairs: 2,
    measuredPairs: 4,
    minimumCompletedPoints: 32_000_000,
    minimumElapsedMs: 650,
    maximumElapsedMs: 180_000,
    note: 'Fast directional signal',
  },
  standard: {
    label: 'Standard',
    warmupPairs: 2,
    measuredPairs: 8,
    minimumCompletedPoints: 128_000_000,
    minimumElapsedMs: 1_350,
    maximumElapsedMs: 480_000,
    note: 'Recommended comparison',
  },
  rigorous: {
    label: 'Rigorous',
    warmupPairs: 2,
    measuredPairs: 16,
    minimumCompletedPoints: 384_000_000,
    minimumElapsedMs: 2_000,
    maximumElapsedMs: 900_000,
    note: 'Tighter confidence interval',
  },
}

const CUSTOM_VARIATION_COMPILER_ID = 'safe-custom-variation/v1'
const RNG_COMPARISON_SELECTION_ID = 'compare-legacy-vs-typegpu-noise' as const
type RngSelectionId = RngImplementationId | typeof RNG_COMPARISON_SELECTION_ID
const EXECUTABLE_RNG_IMPLEMENTATIONS = RNG_IMPLEMENTATION_LIST.filter(
  (implementation) => implementation.execution.executable,
)
const PLANNED_RNG_IMPLEMENTATIONS = RNG_IMPLEMENTATION_LIST.filter(
  (implementation) => !implementation.execution.executable,
)

const POINT_INIT_OPTIONS: readonly {
  value: PointInitMode
  label: string
}[] = [
  { value: 'pointInitUnitDisk', label: 'Unit disk' },
  { value: 'pointInitGaussianDisk', label: 'Gaussian disk' },
  { value: 'pointInitSquare', label: 'Square' },
  { value: 'pointInitPerlin', label: 'Perlin field' },
  { value: 'pointInitHalton', label: 'Halton sequence' },
]

const VARIATION_TEMPLATES: readonly VariationTemplate[] = [
  {
    id: 'linear',
    label: 'Linear',
    variationType: 'linearVar',
    body: 'return vec2f(pos).mul(varInfo.weight)',
  },
  {
    id: 'sinusoidal',
    label: 'Sinusoidal',
    variationType: 'sinusoidalVar',
    body: 'return vec2f(sin(pos.x), sin(pos.y)).mul(varInfo.weight)',
  },
  {
    id: 'spherical',
    label: 'Spherical',
    variationType: 'sphericalVar',
    body: `const r2 = dot(pos, pos) + EPS.$
return pos.div(r2).mul(varInfo.weight)`,
  },
]

const BUILTIN_DEFAULT_IDS = new Set([
  'builtin:example2',
  'builtin:example1',
  'builtin:benchmark',
])

class BenchmarkRunCancelled extends Error {
  constructor(readonly reason: 'device-lost' | 'hidden-tab' | 'user') {
    super(`Benchmark cancelled: ${reason}`)
  }
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      aria-hidden="true"
    >
      <path d="m3 8.5 3 3 7-7" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      aria-hidden="true"
    >
      <path d="M2 12h4l2.2-6 3.6 12 2.7-8 1.8 2H22" />
    </svg>
  )
}

function FlameGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      aria-hidden="true"
    >
      <path d="M13.2 2.7c.6 3.4-2.8 4.9-2.3 8 .2 1.4 1.2 2.1 2.4 2.9-.1-2.1 1.1-3.3 2.5-4.5 1.7 1.7 3.2 3.8 3.2 6.5 0 3.6-3 6.4-6.8 6.4S5 19.1 5 15.2c0-4.7 4.1-6.9 8.2-12.5Z" />
    </svg>
  )
}

function sourceLabel(source: BenchmarkFlameSourceDescriptor): string {
  switch (source.source) {
    case 'builtin':
      return 'Built-in'
    case 'recent':
      return 'Recent'
    case 'gallery':
      return `Generation ${source.provenance.generation ?? 0}`
    case 'generated':
      return `Seed ${source.provenance.seed ?? 0}`
    case 'upload':
      return 'Upload'
    default:
      return 'Flame'
  }
}

function algorithmLabel(algorithm: BenchmarkAlgorithm): string {
  switch (algorithm) {
    case 'current':
      return 'Current point accumulation'
    case 'mitchell':
      return 'Mitchell–Netravali reconstruction'
    case 'compare':
      return 'Current ↔ Mitchell–Netravali'
  }
}

function formatRate(value: number | undefined, compact = false): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(compact ? 2 : 3)} B/s`
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(compact ? 1 : 2)} M/s`
  }
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K/s`
  return `${value.toFixed(0)} /s`
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function formatSignedPercent(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
}

function correctnessLabel(status: BenchmarkCorrectnessStatus): string {
  switch (status) {
    case 'passed':
      return 'render smoke passed'
    case 'failed':
      return 'render smoke failed'
    case 'not-checked':
      return 'render smoke unavailable'
  }
}

function downloadTextFile(file: BenchmarkTextExport): void {
  const url = URL.createObjectURL(
    new Blob([file.text], { type: file.mimeType }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

function drawShareCard(run: CompletedLabRun): void {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const context = canvas.getContext('2d')
  if (!context) return

  const summary = run.result.candidates.at(-1)?.throughput
  const baselineSummary = run.result.candidates[0]?.throughput
  const comparison = run.result.comparison
  const title = run.manifest.workload.flame.label
  const coreValue = comparison
    ? `${comparison.percentChange >= 0 ? '+' : ''}${comparison.percentChange.toFixed(2)}%`
    : formatRate(summary?.median)
  const coreLabel = comparison ? 'PAIRED CHANGE' : 'MEDIAN COMPLETED POINTS'

  context.fillStyle = '#080a0e'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const glow = context.createRadialGradient(280, 315, 20, 280, 315, 300)
  glow.addColorStop(0, 'rgba(255,116,72,.16)')
  glow.addColorStop(1, 'rgba(255,116,72,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 620, 630)

  drawBenchmarkDialGeometry(context, {
    centerX: 280,
    centerY: 315,
    scale: 190 / BENCHMARK_DIAL.outerRadius,
  })

  context.fillStyle = '#f3f4f6'
  context.textAlign = 'center'
  context.font = '650 54px Inter, system-ui, sans-serif'
  context.fillText(coreValue, 280, 310)
  context.fillStyle = '#929aa7'
  context.font = '560 13px Inter, system-ui, sans-serif'
  context.fillText(coreLabel, 280, 345)

  context.textAlign = 'left'
  context.fillStyle = '#ff7448'
  context.font = '650 16px Inter, system-ui, sans-serif'
  context.fillText('LUMEN APEIRON  /  BENCHMARK LAB', 610, 120)
  context.fillStyle = '#f3f4f6'
  context.font = '560 38px Inter, system-ui, sans-serif'
  context.fillText(title.slice(0, 31), 610, 190)
  context.fillStyle = '#929aa7'
  context.font = '400 18px Inter, system-ui, sans-serif'
  context.fillText(
    run.manifest.candidates.map((candidate) => candidate.label).join(' ↔ '),
    610,
    230,
    500,
  )

  const lines = comparison
    ? ([
        ['A median', formatRate(baselineSummary?.median)],
        ['B median', formatRate(summary?.median)],
        ['Pairs', String(comparison.pairedSampleCount)],
        ['Runner', 'lab-v1 · queue fenced'],
      ] as const)
    : ([
        ['Samples', String(summary?.count ?? 0)],
        [
          'Stability',
          summary?.cv === undefined
            ? '—'
            : `${(summary.cv * 100).toFixed(1)}% CV`,
        ],
        ['Comparison', 'Single profile'],
        ['Runner', 'lab-v1 · queue fenced'],
      ] as const)
  let y = 310
  for (const [label, value] of lines) {
    context.strokeStyle = 'rgba(255,255,255,.1)'
    context.beginPath()
    context.moveTo(610, y - 25)
    context.lineTo(1110, y - 25)
    context.stroke()
    context.fillStyle = '#6f7885'
    context.font = '500 14px Inter, system-ui, sans-serif'
    context.fillText(label.toUpperCase(), 610, y)
    context.fillStyle = '#f3f4f6'
    context.font = '560 18px Inter, system-ui, sans-serif'
    context.textAlign = 'right'
    context.fillText(value, 1110, y)
    context.textAlign = 'left'
    y += 64
  }

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `lumen-apeiron-benchmark-${run.result.id}.png`
    link.click()
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }, 'image/png')
}

function withRunSettings(
  source: BenchmarkFlameSourceDescriptor,
  settings: LabSettings,
): FlameDescriptor {
  const flame = deepClone(source.flame)
  flame.renderSettings.pointInitMode = settings.pointInitMode
  flame.renderSettings.plotsPerChain = settings.plotsPerChain
  flame.renderSettings.skipIters = settings.skipIters
  return flame
}

function withControlledVariation(
  original: FlameDescriptor,
  variationType: string,
): FlameDescriptor {
  const flame = deepClone(original)
  const transforms = Object.entries(flame.transforms).sort(([left], [right]) =>
    left.localeCompare(right),
  )
  for (const [index, [, transform]] of transforms.entries()) {
    const variationId = `benchmark_variation_${index}` as VariationId
    transform.variations = {
      [variationId]: {
        type: variationType,
        weight: 1,
        visible: true,
      },
    }
  }
  flame.finalTransform = undefined
  return flame
}

function signatureLooksRendered(
  signatures: readonly (readonly number[])[],
): boolean {
  if (signatures.length === 0) return false
  return signatures.some((signature) => {
    const lit = signature.filter((value) => value > 1).length
    const max = Math.max(...signature)
    return lit >= 2 && max > 4
  })
}

function FlameTile(props: {
  source: BenchmarkFlameSourceDescriptor
  selected: boolean
  paused: boolean
  previewEnabled: boolean
  scrolling: boolean
  trackActivation: ReturnType<typeof createSharedIntersectionObserver>
  trackVisibility: ReturnType<typeof createSharedIntersectionObserver>
  onToggle: () => void
}) {
  const [element, setElement] = createSignal<Element>()
  const nearViewport = props.trackActivation(element)
  const visible = props.trackVisibility(element)
  const [previewCreated, setPreviewCreated] = createSignal(false)

  createEffect(() => {
    if (nearViewport() && !props.scrolling) setPreviewCreated(true)
  })

  return (
    <button
      ref={setElement}
      type="button"
      class={ui.flameTile}
      classList={{ [ui.flameTileSelected!]: props.selected }}
      aria-label={`${props.selected ? 'Remove' : 'Add'} ${props.source.label} ${
        props.selected ? 'from' : 'to'
      } benchmark corpus`}
      aria-pressed={props.selected}
      onClick={props.onToggle}
    >
      <div class={ui.previewPlaceholder}>
        <FlameGlyph />
        <Show when={!props.previewEnabled}>
          <span>Preview unavailable</span>
        </Show>
      </div>
      <Show when={previewCreated()}>
        <div class={ui.flamePreview}>
          <VariationPreview
            version={0}
            isSelected={props.selected}
            isVisible={visible()}
            paused={props.paused || !props.previewEnabled}
            scrolling={props.scrolling}
            snapshotOnly
            flame={props.source.flame}
            name={`benchmark-${props.source.id}`}
            hardwareTier="mid"
            resolution={{ width: 256, height: 144 }}
          />
        </div>
      </Show>
      <span class={ui.tileShade} />
      <span class={ui.tileText}>
        <span class={ui.tileName}>
          <strong>{props.source.label}</strong>
          <span>
            {sourceLabel(props.source)} · {props.source.transformCount} tf ·{' '}
            {props.source.dimensions}D
          </span>
        </span>
        <span
          class={ui.tileCheck}
          classList={{ [ui.tileCheckSelected!]: props.selected }}
        >
          <CheckIcon />
        </span>
      </span>
    </button>
  )
}

export function BenchmarksPage() {
  const { adapter, device } = useRootContext()
  const { showToast } = useToast()
  const showClassicBenchmark = createShowBenchmark()

  const [algorithm, setAlgorithm] = createSignal<BenchmarkAlgorithm>('compare')
  const [rngSelection, setRngSelection] = createSignal<RngSelectionId>(
    RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
  )
  const [protocolId, setProtocolId] = createSignal<ProtocolId>('quick')
  const [settings, setSettings] = createSignal<LabSettings>({
    pointInitMode: 'pointInitUnitDisk',
    plotsPerChain: 16,
    skipIters: 20,
    persistChains: true,
    resolution: 1024,
    pointCountPerBatch: 262_144,
  })
  const [sourceTab, setSourceTab] = createSignal<SourceTab>('builtins')
  const [builtinSources] = createSignal(listBuiltinBenchmarkFlames())
  const [recentSources] = createSignal(listRecentBenchmarkFlames())
  const [ancestrySources, setAncestrySources] = createSignal<
    readonly BenchmarkFlameSourceDescriptor[]
  >([])
  const [ancestryLoading, setAncestryLoading] = createSignal(false)
  const [uploadedSources, setUploadedSources] = createSignal<
    readonly BenchmarkFlameSourceDescriptor[]
  >([])
  const [generatedSources, setGeneratedSources] = createSignal<
    readonly BenchmarkFlameSourceDescriptor[]
  >([])
  const [selectedIds, setSelectedIds] = createSignal(
    builtinSources()
      .filter((source) => BUILTIN_DEFAULT_IDS.has(source.id))
      .map((source) => source.id),
  )
  const [surpriseSeed, setSurpriseSeed] = createSignal(0x4348_414f)

  const [customLabEnabled, setCustomLabEnabled] = createSignal(false)
  const [templateId, setTemplateId] =
    createSignal<VariationTemplate['id']>('linear')
  const [candidateCode, setCandidateCode] = createSignal(
    VARIATION_TEMPLATES[0]!.body,
  )
  const [compileState, setCompileState] = createSignal<CompileState>({
    status: 'idle',
    message: 'Not validated',
  })

  const [running, setRunning] = createSignal(false)
  const [classicOpen, setClassicOpen] = createSignal(false)
  const [activeSample, setActiveSample] = createSignal<ActiveSample>()
  const [runProgress, setRunProgress] = createSignal<RunProgress>()
  const [runError, setRunError] = createSignal<string>()
  const [completedRuns, setCompletedRuns] = createSignal<
    readonly CompletedLabRun[]
  >([])
  const [history, setHistory] = createSignal<
    readonly BenchmarkResultHistoryEntry[]
  >([])
  let uploadInput: HTMLInputElement | undefined
  const [galleryElement, setGalleryElement] = createSignal<HTMLDivElement>()
  let ancestryRequested = false
  let runGeneration = 0
  let resolveActiveSample:
    | ((result: BenchmarkHostResult | BenchmarkRunCancelled | Error) => void)
    | undefined

  const trackTileActivation = createSharedIntersectionObserver(galleryElement, {
    rootMargin: '260px',
  })
  const trackTileVisibility = createSharedIntersectionObserver(galleryElement, {
    rootMargin: '80px 0px',
  })
  const galleryScrolling = useElementIsScrolling(galleryElement)

  const allSources = createMemo(() => [
    ...builtinSources(),
    ...recentSources(),
    ...ancestrySources(),
    ...uploadedSources(),
    ...generatedSources(),
  ])

  const visibleSources = createMemo(() => {
    switch (sourceTab()) {
      case 'builtins':
        return builtinSources()
      case 'recent':
        return recentSources()
      case 'ancestry':
        return ancestrySources()
      case 'uploads':
        return uploadedSources()
      case 'generated':
        return generatedSources()
    }
  })

  const selectedSources = createMemo(() => {
    const ids = new Set(selectedIds())
    return allSources().filter((source) => ids.has(source.id))
  })

  const selectedTemplate = createMemo(
    () =>
      VARIATION_TEMPLATES.find((template) => template.id === templateId()) ??
      VARIATION_TEMPLATES[0]!,
  )
  const templateDocumentation = createMemo(() =>
    getVariationDoc(selectedTemplate().variationType),
  )
  const protocol = createMemo(() => PROTOCOLS[protocolId()])
  const customCompatible = createMemo(
    () =>
      selectedSources().length > 0 &&
      selectedSources().every((source) => source.dimensions === 2),
  )
  const rngComparison = createMemo(
    () => rngSelection() === RNG_COMPARISON_SELECTION_ID,
  )
  const selectedRngId = createMemo<RendererRandomImplementationId>(() =>
    rngSelection() === RNG_IMPLEMENTATION_IDS.legacy
      ? RNG_IMPLEMENTATION_IDS.legacy
      : RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
  )
  const selectedRng = createMemo(
    () =>
      RNG_IMPLEMENTATION_LIST.find(
        (implementation) => implementation.id === selectedRngId(),
      )!,
  )
  const isComparison = createMemo(
    () => customLabEnabled() || rngComparison() || algorithm() === 'compare',
  )
  const runProfileLabel = createMemo(() => {
    if (customLabEnabled()) {
      return `${selectedTemplate().label} variation A/B`
    }
    if (rngComparison()) {
      return `${algorithmLabel(algorithm())} · legacy ↔ TypeGPU noise RNG`
    }
    return algorithmLabel(algorithm())
  })
  const scheduleLengthPerFlame = createMemo(() => {
    const p = protocol()
    return (p.warmupPairs + p.measuredPairs) * (isComparison() ? 2 : 1)
  })
  const estimatedDurationSeconds = createMemo(
    () =>
      Math.ceil(
        (selectedSources().length *
          scheduleLengthPerFlame() *
          protocol().minimumElapsedMs) /
          1000,
      ) || 0,
  )
  const memoryFootprint = createMemo(() => settings().pointCountPerBatch * 32)
  const gpuLabel = createMemo(() => {
    const description = adapter?.info.description
    const vendor = adapter?.info.vendor
    return description || vendor || 'Browser-selected adapter'
  })
  onMount(() => {
    const previousTitle = document.title
    document.title = 'Benchmark Lab — Lumen Apeiron'

    void loadBenchmarkResultHistory({ limit: 8 })
      .then(setHistory)
      .catch(() => {
        showToast('Benchmark history is unavailable in this browser.')
      })

    const handleVisibility = () => {
      if (document.hidden && running()) cancelRun('hidden-tab')
    }
    document.addEventListener('visibilitychange', handleVisibility)
    onCleanup(() => {
      document.title = previousTitle
      document.removeEventListener('visibilitychange', handleVisibility)
    })
  })

  createEffect(() => {
    if (sourceTab() !== 'ancestry' || ancestryRequested) return
    ancestryRequested = true
    setAncestryLoading(true)
    void initAncestry()
      .then(() => {
        setAncestrySources(listAncestryBenchmarkFlames(getAncestryNodes()))
      })
      .catch(() => {
        showToast('Local ancestry could not be loaded.')
      })
      .finally(() => {
        setAncestryLoading(false)
      })
  })

  createEffect(() => {
    if (
      running() &&
      (gpuStatus() === 'unavailable' || gpuStatus() === 'unsupported')
    ) {
      cancelRun('device-lost')
    }
  })

  function updateSetting<K extends keyof LabSettings>(
    key: K,
    value: LabSettings[K],
  ): void {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  function changeAlgorithm(next: BenchmarkAlgorithm): void {
    if (next === 'compare' && rngComparison()) {
      setRngSelection(RNG_IMPLEMENTATION_IDS.xoroshiro64ss)
    }
    if (next === 'compare' && customLabEnabled()) {
      setCustomLabEnabled(false)
    }
    setAlgorithm(next)
  }

  function changeRngSelection(next: string): void {
    if (next === RNG_COMPARISON_SELECTION_ID) {
      if (customLabEnabled()) return
      if (algorithm() === 'compare') setAlgorithm('current')
      setRngSelection(next)
      return
    }
    if (
      next === RNG_IMPLEMENTATION_IDS.legacy ||
      next === RNG_IMPLEMENTATION_IDS.xoroshiro64ss
    ) {
      setRngSelection(next)
    }
  }

  function toggleCustomLab(): void {
    const next = !customLabEnabled()
    if (next && rngComparison()) {
      setRngSelection(RNG_IMPLEMENTATION_IDS.xoroshiro64ss)
    }
    if (next && algorithm() === 'compare') {
      setAlgorithm('current')
    }
    setCustomLabEnabled(next)
  }

  async function openClassicBenchmark(): Promise<void> {
    if (running() || classicOpen()) return
    setClassicOpen(true)
    try {
      await showClassicBenchmark()
    } finally {
      setClassicOpen(false)
    }
  }

  async function clearLocalHistory(): Promise<void> {
    if (
      !globalThis.confirm(
        'Clear every locally saved Benchmark Lab result from this browser?',
      )
    ) {
      return
    }
    await clearBenchmarkResultHistory()
    setHistory([])
    showToast('Local benchmark history cleared.')
  }

  function toggleSource(id: string): void {
    if (running()) return
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    )
  }

  function selectVisible(): void {
    const visible = visibleSources().map((source) => source.id)
    const allSelected = visible.every((id) => selectedIds().includes(id))
    if (allSelected) {
      const visibleSet = new Set(visible)
      setSelectedIds((ids) => ids.filter((id) => !visibleSet.has(id)))
    } else {
      setSelectedIds((ids) => [...new Set([...ids, ...visible])])
    }
  }

  function addSurprise(): void {
    const source = createSeededSurpriseFlame(surpriseSeed())
    setGeneratedSources((sources) => [
      source,
      ...sources.filter((item) => item.id !== source.id),
    ])
    setSelectedIds((ids) => [...new Set([...ids, source.id])])
    setSourceTab('generated')
    setSurpriseSeed((seed) => (seed + 0x9e37_79b9) >>> 0)
    showToast(`Frozen surprise seed ${source.provenance.seed} added.`)
  }

  async function importFiles(files: FileList | readonly File[]): Promise<void> {
    for (const file of [...files]) {
      try {
        const parsed = await parseBenchmarkFlameUpload(file)
        setUploadedSources((sources) => [
          parsed.source,
          ...sources.filter((item) => item.id !== parsed.source.id),
        ])
        setSelectedIds((ids) => [...new Set([...ids, parsed.source.id])])
        setSourceTab('uploads')
        const suffix =
          parsed.warnings.length > 0
            ? ` ${parsed.warnings.length} import warning${
                parsed.warnings.length === 1 ? '' : 's'
              }.`
            : ''
        showToast(`${parsed.source.label} added to the corpus.${suffix}`)
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : 'Could not import flame.',
        )
      }
    }
  }

  function chooseTemplate(template: VariationTemplate): void {
    if (running()) return
    setTemplateId(template.id)
    setCandidateCode(template.body)
    setCompileState({
      status: 'dirty',
      message: 'Candidate changed — validate before running',
    })
  }

  function validateCandidate(): boolean {
    const startedAt = globalThis.performance.now()
    const result = compileCustomVariationCode(candidateCode())
    const elapsedMs = globalThis.performance.now() - startedAt
    if (result.valid) {
      setCompileState({
        status: 'valid',
        elapsedMs,
        message: `Safe subset compiled · ${elapsedMs.toFixed(1)} ms`,
      })
      return true
    }
    setCompileState({
      status: 'invalid',
      elapsedMs,
      message: result.errors.map((error) => error.message).join(' · '),
    })
    return false
  }

  function cancelRun(
    reason: 'device-lost' | 'hidden-tab' | 'user' = 'user',
  ): void {
    if (!running()) return
    runGeneration += 1
    resolveActiveSample?.(new BenchmarkRunCancelled(reason))
    resolveActiveSample = undefined
    setActiveSample(undefined)
    setRunning(false)
    setRunProgress(undefined)
    setRunError(
      reason === 'hidden-tab'
        ? 'Run cancelled because the tab became hidden. This prevents throttled samples from entering history.'
        : reason === 'device-lost'
          ? 'Run cancelled because the WebGPU device became unavailable.'
          : undefined,
    )
  }

  function executeActiveSample(
    runtime: CandidateRuntime,
    p: (typeof PROTOCOLS)[ProtocolId],
    progress: Omit<RunProgress, 'pointsPerSecond'>,
  ): Promise<BenchmarkHostResult> {
    const { promise, resolve } = Promise.withResolvers<
      BenchmarkHostResult | BenchmarkRunCancelled | Error
    >()
    resolveActiveSample = resolve
    const sample: ActiveSample = {
      key: globalThis.crypto.randomUUID(),
      flame: runtime.flame,
      stochasticFilterEnabled: runtime.stochasticFilterEnabled,
      randomImplementationId: runtime.randomImplementationId,
      minimumCompletedPoints: p.minimumCompletedPoints,
      minimumElapsedMs: p.minimumElapsedMs,
      maximumElapsedMs: p.maximumElapsedMs,
      pointCountPerBatch: settings().pointCountPerBatch,
      resolution: settings().resolution,
      persistChains: settings().persistChains,
      onComplete: resolve,
      onError: (error) => {
        console.error(error)
        resolve(
          error instanceof Error
            ? error
            : new Error('The WebGPU benchmark queue failed.'),
        )
      },
      onProgress: (result) => {
        setRunProgress({
          ...progress,
          pointsPerSecond: result.pointsPerSecond,
        })
      },
    }
    setActiveSample(sample)
    return promise.then((outcome) => {
      resolveActiveSample = undefined
      setActiveSample(undefined)
      if (outcome instanceof BenchmarkRunCancelled) throw outcome
      if (outcome instanceof Error) throw outcome
      return outcome
    })
  }

  function createCandidates(
    flame: FlameDescriptor,
    transientVariationId?: string,
  ): readonly CandidateRuntime[] {
    const runtimeRngId = selectedRngId()
    const rngImplementation = (implementationId: RngImplementationId) =>
      createRngBenchmarkImplementation({
        schemaVersion: RNG_BENCHMARK_SETTINGS_SCHEMA_VERSION,
        implementationId,
        seedPolicyId: RNG_SEED_POLICY_IDS.legacyPersisted,
      })
    const fixedRngImplementation = rngImplementation(runtimeRngId)

    if (transientVariationId) {
      const mitchell = algorithm() === 'mitchell'
      const reconstructionImplementation: BenchmarkImplementationV1 = {
        kind: 'reconstruction',
        id: mitchell
          ? 'mitchell-netravali-stochastic-v1'
          : 'point-accumulation-v1',
        label: mitchell
          ? 'Mitchell–Netravali stochastic reconstruction'
          : 'Direct point accumulation',
        settings: {
          stochasticFilterEnabled: mitchell,
          ...(mitchell ? { B: 0.3333333333333333, C: 0.3333333333333333 } : {}),
        },
      }
      const template = selectedTemplate()
      const sourceDigest = benchmarkSourceDigest(
        candidateCode(),
        CUSTOM_VARIATION_COMPILER_ID,
      )
      const baselineFlame = withControlledVariation(
        flame,
        template.variationType,
      )
      const candidateFlame = withControlledVariation(
        flame,
        transientVariationId,
      )
      return [
        {
          candidate: {
            id: `variation:${template.variationType}`,
            label: `${template.label} built-in`,
            role: 'baseline',
            implementations: [
              reconstructionImplementation,
              {
                kind: 'variation',
                id: template.variationType,
                label: `${template.label} built-in`,
                settings: { source: 'application-registry' },
              },
              fixedRngImplementation,
            ],
            metadata: {
              lane: 'reference',
              executionFlameDigest: benchmarkFlameDigest(baselineFlame),
            },
          },
          flame: baselineFlame,
          stochasticFilterEnabled: mitchell,
          randomImplementationId: runtimeRngId,
        },
        {
          candidate: {
            id: `variation:custom:${sourceDigest}`,
            label: `${template.label} candidate`,
            role: 'candidate',
            implementations: [
              reconstructionImplementation,
              {
                kind: 'variation',
                id: `${template.variationType}:custom`,
                label: `${template.label} candidate`,
                digest: sourceDigest,
                settings: {
                  source: 'transient-safe-compiler',
                  compilerId: CUSTOM_VARIATION_COMPILER_ID,
                  body: candidateCode(),
                },
              },
              fixedRngImplementation,
            ],
            metadata: {
              lane: 'candidate',
              executionFlameDigest: benchmarkFlameDigest(candidateFlame),
            },
          },
          flame: candidateFlame,
          stochasticFilterEnabled: mitchell,
          randomImplementationId: runtimeRngId,
        },
      ]
    }

    if (rngComparison()) {
      const mitchell = algorithm() === 'mitchell'
      const reconstructionImplementation: BenchmarkImplementationV1 = {
        kind: 'reconstruction',
        id: mitchell
          ? 'mitchell-netravali-stochastic-v1'
          : 'point-accumulation-v1',
        label: mitchell
          ? 'Mitchell–Netravali stochastic reconstruction'
          : 'Direct point accumulation',
        settings: {
          stochasticFilterEnabled: mitchell,
          ...(mitchell ? { B: 0.3333333333333333, C: 0.3333333333333333 } : {}),
        },
      }
      return [
        {
          candidate: {
            id: `rng:${RNG_IMPLEMENTATION_IDS.legacy}:${mitchell ? 'mitchell' : 'current'}`,
            label: 'Legacy state-word RNG',
            role: 'baseline',
            implementations: [
              reconstructionImplementation,
              rngImplementation(RNG_IMPLEMENTATION_IDS.legacy),
            ],
            metadata: { lane: 'reference', comparisonAxis: 'rng-output' },
          },
          flame,
          stochasticFilterEnabled: mitchell,
          randomImplementationId: RNG_IMPLEMENTATION_IDS.legacy,
        },
        {
          candidate: {
            id: `rng:${RNG_IMPLEMENTATION_IDS.xoroshiro64ss}:${mitchell ? 'mitchell' : 'current'}`,
            label: 'TypeGPU noise xoroshiro64**',
            role: 'candidate',
            implementations: [
              reconstructionImplementation,
              rngImplementation(RNG_IMPLEMENTATION_IDS.xoroshiro64ss),
            ],
            metadata: { lane: 'candidate', comparisonAxis: 'rng-output' },
          },
          flame,
          stochasticFilterEnabled: mitchell,
          randomImplementationId: RNG_IMPLEMENTATION_IDS.xoroshiro64ss,
        },
      ]
    }

    if (algorithm() === 'compare') {
      return [
        {
          candidate: {
            id: 'renderer:current-v1',
            label: 'Current accumulation',
            role: 'baseline',
            implementations: [
              {
                kind: 'reconstruction',
                id: 'point-accumulation-v1',
                label: 'Direct point accumulation',
                settings: { stochasticFilterEnabled: false },
              },
              fixedRngImplementation,
            ],
            metadata: { lane: 'reference' },
          },
          flame,
          stochasticFilterEnabled: false,
          randomImplementationId: runtimeRngId,
        },
        {
          candidate: {
            id: 'renderer:mitchell-netravali-v1',
            label: 'Mitchell–Netravali',
            role: 'candidate',
            implementations: [
              {
                kind: 'reconstruction',
                id: 'mitchell-netravali-stochastic-v1',
                label: 'Mitchell–Netravali stochastic reconstruction',
                settings: {
                  stochasticFilterEnabled: true,
                  B: 0.3333333333333333,
                  C: 0.3333333333333333,
                },
              },
              fixedRngImplementation,
            ],
            metadata: { lane: 'candidate' },
          },
          flame,
          stochasticFilterEnabled: true,
          randomImplementationId: runtimeRngId,
        },
      ]
    }

    const mitchell = algorithm() === 'mitchell'
    return [
      {
        candidate: {
          id: mitchell
            ? 'renderer:mitchell-netravali-v1'
            : 'renderer:current-v1',
          label: mitchell ? 'Mitchell–Netravali' : 'Current accumulation',
          role: 'baseline',
          implementations: [
            {
              kind: 'reconstruction',
              id: mitchell
                ? 'mitchell-netravali-stochastic-v1'
                : 'point-accumulation-v1',
              label: mitchell
                ? 'Mitchell–Netravali stochastic reconstruction'
                : 'Direct point accumulation',
              settings: { stochasticFilterEnabled: mitchell },
            },
            fixedRngImplementation,
          ],
          metadata: { lane: 'single' },
        },
        flame,
        stochasticFilterEnabled: mitchell,
        randomImplementationId: runtimeRngId,
      },
    ]
  }

  function createManifest(
    source: BenchmarkFlameSourceDescriptor,
    frozenFlame: FlameDescriptor,
    runtimes: readonly CandidateRuntime[],
    schedule: readonly BenchmarkScheduleEntryV1[],
  ): BenchmarkManifestV1 {
    const now = new Date().toISOString()
    const p = protocol()
    const frozenDigest = benchmarkFlameDigest(frozenFlame)
    const frozenSource: BenchmarkFlameSourceDescriptor = {
      ...source,
      flame: frozenFlame,
      digest: frozenDigest,
    }
    const common = {
      schemaVersion: BENCHMARK_MANIFEST_SCHEMA_VERSION,
      id: globalThis.crypto.randomUUID(),
      createdAt: now,
      appVersion: VERSION,
      buildId: GIT_SHA || 'development',
      environment: {
        kind: 'local-webgpu' as const,
        executorId: 'browser-local-v1',
        requestedFeatures: [] as readonly string[],
        metadata: {
          userAgent: globalThis.navigator.userAgent,
          visibilityState: document.visibilityState,
        },
      },
      protocol: {
        id: `lab-v1:${protocolId()}`,
        timingMode: 'queue-fenced-wall-clock' as const,
        warmupPairs: p.warmupPairs,
        measuredPairs: p.measuredPairs,
        workBudget: {
          kind: 'minimum-work-and-duration' as const,
          workUnits: p.minimumCompletedPoints,
          durationMs: p.minimumElapsedMs,
        },
        metric: {
          id: 'completed-points-per-second',
          label: 'Completed points per second',
          unit: 'points/s',
          direction: 'higher-is-better' as const,
        },
        compilation: 'reported-separately' as const,
      },
      workload: {
        id: `workload:${frozenDigest}:${settings().resolution}`,
        label: source.label,
        flame: toBenchmarkFlameV1(frozenSource),
        width: settings().resolution,
        height: settings().resolution,
        pointCount: settings().pointCountPerBatch,
        deterministicSeed: source.provenance.seed ?? 0x4348_414f,
        settings: {
          pointInitMode: settings().pointInitMode,
          plotsPerChain: settings().plotsPerChain,
          skipIters: settings().skipIters,
          persistChains: settings().persistChains,
          minimumElapsedMs: p.minimumElapsedMs,
          maximumElapsedMs: p.maximumElapsedMs,
          deterministicSeedUsage: 'ignored-by-persisted-renderer-rng',
        },
      },
      schedule,
      metadata: {
        runner: 'lab-v1',
        page: '/benchmarks',
        previewsQuiesced: true,
        firstQueueSubmissionExcluded: true,
      },
    }

    if (runtimes.length === 2) {
      return {
        ...common,
        mode: 'comparison',
        candidates: [runtimes[0]!.candidate, runtimes[1]!.candidate],
      }
    }
    return {
      ...common,
      mode: 'single',
      candidates: [runtimes[0]!.candidate],
    }
  }

  function buildResult(
    resultId: string,
    manifest: BenchmarkManifestV1,
    samples: readonly BenchmarkSampleV1[],
    compilation: readonly BenchmarkCompilationV1[],
    signatures: ReadonlyMap<string, readonly (readonly number[])[]>,
    startedAt: string,
  ): BenchmarkResultV1 {
    const candidates = deriveBenchmarkCandidateSummaries(manifest, samples)
    let comparison: BenchmarkResultV1['comparison']
    if (manifest.mode === 'comparison') {
      const [baseline, candidate] = manifest.candidates
      const baselineSignatures = signatures.get(baseline.id) ?? []
      const candidateSignatures = signatures.get(candidate.id) ?? []
      const signaturesAvailable =
        baselineSignatures.length > 0 && candidateSignatures.length > 0
      const correctness = !signaturesAvailable
        ? 'not-checked'
        : signatureLooksRendered(baselineSignatures) &&
            signatureLooksRendered(candidateSignatures)
          ? 'passed'
          : 'failed'
      comparison = deriveBenchmarkComparison(manifest, samples, {
        correctness,
      })
    }

    const info = adapter?.info
    const preliminary: BenchmarkResultV1 = {
      schemaVersion: BENCHMARK_RESULT_SCHEMA_VERSION,
      id: resultId,
      manifestId: manifest.id,
      status: 'completed',
      startedAt,
      completedAt: new Date().toISOString(),
      device: {
        adapter: info?.description || info?.vendor || 'WebGPU adapter',
        ...(info?.architecture ? { architecture: info.architecture } : {}),
        ...(info?.vendor ? { vendor: info.vendor } : {}),
        browser: globalThis.navigator.userAgent,
        features: device ? [...device.features].sort() : [],
        metadata: {
          maxBufferSize: device?.limits.maxBufferSize ?? 0,
          hardwareConcurrency: globalThis.navigator.hardwareConcurrency,
        },
      },
      compilation,
      samples,
      candidates,
      ...(comparison ? { comparison } : {}),
      validation: { status: 'valid', issues: [] },
      metadata: {
        runner: 'lab-v1',
        correctnessMethod:
          manifest.mode === 'comparison'
            ? 'nonblank-render-smoke/v1'
            : 'not-checked',
        correctnessScope: customLabEnabled()
          ? 'safe-compile-and-nonblank-render-smoke'
          : manifest.mode === 'comparison'
            ? 'nonblank-render-smoke'
            : 'not-checked',
      },
    }
    const validation = validateBenchmarkResult(preliminary, manifest)
    return {
      ...preliminary,
      status: validation.status === 'invalid' ? 'invalid' : 'completed',
      validation,
    }
  }

  async function runBenchmarks(): Promise<void> {
    if (running()) return
    setRunError(undefined)
    if (gpuStatus() !== 'ready' || !device) {
      setRunError('A ready WebGPU adapter is required to run local benchmarks.')
      return
    }
    if (selectedSources().length === 0) {
      setRunError('Select at least one frozen flame workload.')
      return
    }
    if (customLabEnabled() && !customCompatible()) {
      setRunError('The custom variation lab currently accepts 2D flames only.')
      return
    }

    let transient:
      | { valid: true; id: string; unregister: () => void }
      | undefined
    let compilationElapsedMs: number | null = null
    if (customLabEnabled()) {
      if (!validateCandidate()) return
      const compileStartedAt = globalThis.performance.now()
      const preview = previewCustomVariation(candidateCode())
      compilationElapsedMs = globalThis.performance.now() - compileStartedAt
      if (!preview.valid) {
        setCompileState({
          status: 'invalid',
          elapsedMs: compilationElapsedMs,
          message: preview.errors.map((error) => error.message).join(' · '),
        })
        return
      }
      transient = preview
    }

    const generation = ++runGeneration
    const newRuns: CompletedLabRun[] = []
    const totalSamples = selectedSources().length * scheduleLengthPerFlame()
    let completedSamples = 0
    setRunning(true)
    setCompletedRuns([])
    setRunProgress({
      completedSamples,
      totalSamples,
      flameLabel: selectedSources()[0]!.label,
      candidateLabel: 'Preparing',
    })

    try {
      for (const source of selectedSources()) {
        if (generation !== runGeneration)
          throw new BenchmarkRunCancelled('user')
        const runStartedAt = new Date().toISOString()
        const flame = withRunSettings(source, settings())
        const runtimes = createCandidates(flame, transient?.id)
        const schedule =
          runtimes.length === 2
            ? createBalancedComparisonSchedule({
                baselineCandidateId: runtimes[0]!.candidate.id,
                candidateId: runtimes[1]!.candidate.id,
                warmupPairs: protocol().warmupPairs,
                measuredPairs: protocol().measuredPairs,
              })
            : createSingleCandidateSchedule({
                candidateId: runtimes[0]!.candidate.id,
                warmupSamples: protocol().warmupPairs,
                measuredSamples: protocol().measuredPairs,
              })
        const manifest = createManifest(source, flame, runtimes, schedule)
        const resultId = globalThis.crypto.randomUUID()
        const manifestValidation = validateBenchmarkManifest(manifest)
        if (manifestValidation.status === 'invalid') {
          throw new Error(
            `Generated an invalid manifest: ${manifestValidation.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          )
        }

        const samples: BenchmarkSampleV1[] = []
        const signatures = new Map<string, (readonly number[])[]>()
        for (const entry of schedule) {
          if (generation !== runGeneration) {
            throw new BenchmarkRunCancelled('user')
          }
          const runtime = runtimes.find(
            ({ candidate }) => candidate.id === entry.candidateId,
          )!
          const sampleStartedAt = new Date().toISOString()
          const result = await executeActiveSample(runtime, protocol(), {
            completedSamples,
            totalSamples,
            flameLabel: source.label,
            candidateLabel: runtime.candidate.label,
          })
          if (result.signature) {
            const values = signatures.get(runtime.candidate.id) ?? []
            values.push(result.signature)
            signatures.set(runtime.candidate.id, values)
          }
          samples.push({
            schemaVersion: BENCHMARK_SAMPLE_SCHEMA_VERSION,
            id: globalThis.crypto.randomUUID(),
            runId: resultId,
            manifestId: manifest.id,
            sequence: entry.sequence,
            phase: entry.phase,
            pairIndex: entry.pairIndex,
            orderInPair: entry.orderInPair,
            candidateId: entry.candidateId,
            status: 'valid',
            startedAt: sampleStartedAt,
            timingMode: 'queue-fenced-wall-clock',
            elapsedMs: result.elapsedMs,
            completedWork: result.points,
            throughput: result.pointsPerSecond,
            invalidReasons: [],
            metadata: {
              blockOrder: entry.blockOrder,
              signatureCaptured: result.signature !== undefined,
            },
          })
          completedSamples += 1
          setRunProgress({
            completedSamples,
            totalSamples,
            flameLabel: source.label,
            candidateLabel: runtime.candidate.label,
            pointsPerSecond: result.pointsPerSecond,
          })
        }

        const compilation: BenchmarkCompilationV1[] = runtimes.map(
          ({ candidate }, index) => ({
            candidateId: candidate.id,
            status: 'ready',
            elapsedMs:
              customLabEnabled() && index === 1 ? compilationElapsedMs : null,
            message:
              customLabEnabled() && index === 1
                ? 'Safe custom variation transpile/registration only; GPU pipeline warm-up is excluded by the first completed submission.'
                : 'GPU pipeline cold work is excluded by the first completed submission.',
          }),
        )
        const result = buildResult(
          resultId,
          manifest,
          samples,
          compilation,
          signatures,
          runStartedAt,
        )
        if (result.validation.status === 'invalid') {
          throw new Error(
            `Result validation failed: ${result.validation.issues
              .map((issue) => issue.message)
              .join('; ')}`,
          )
        }
        if (generation !== runGeneration) {
          throw new BenchmarkRunCancelled('user')
        }
        await saveBenchmarkResult(manifest, result)
        if (generation !== runGeneration) {
          await deleteBenchmarkResult(result.id)
          throw new BenchmarkRunCancelled('user')
        }
        const completedRun = { manifest, result }
        newRuns.push(completedRun)
        setCompletedRuns([...newRuns])
      }

      setHistory(await loadBenchmarkResultHistory({ limit: 8 }))
      showToast(
        `${newRuns.length} benchmark result${
          newRuns.length === 1 ? '' : 's'
        } saved locally.`,
      )
    } catch (error) {
      if (error instanceof BenchmarkRunCancelled) {
        if (error.reason !== 'user') {
          setRunError(error.message)
        }
      } else {
        console.error(error)
        setRunError(
          error instanceof Error ? error.message : 'Benchmark run failed.',
        )
      }
    } finally {
      transient?.unregister()
      if (generation === runGeneration) {
        setActiveSample(undefined)
        setRunning(false)
      }
    }
  }

  const progressPercent = createMemo(() => {
    const progress = runProgress()
    if (!progress || progress.totalSamples === 0) return 0
    return (progress.completedSamples / progress.totalSamples) * 100
  })

  return (
    <div
      data-testid="benchmarks-page"
      class={ui.page}
      classList={{ [ui.pageRunning!]: running() }}
    >
      <a href="#benchmark-setup" class={ui.skipLink}>
        Skip to benchmark setup
      </a>
      <header class={ui.header}>
        <div class={ui.brand}>
          <div class={ui.brandMark}>
            <FlameGlyph />
          </div>
          <div class={ui.brandText}>
            <strong>Lumen Apeiron</strong>
            <span>Benchmark laboratory</span>
          </div>
        </div>
        <div class={ui.headerActions}>
          <div
            class={ui.gpuStatus}
            title={gpuStatus() === 'ready' ? 'Local GPU ready' : gpuStatus()}
          >
            <span
              class={ui.statusDot}
              classList={{ [ui.statusReady!]: gpuStatus() === 'ready' }}
            />
            {gpuStatus() === 'ready' ? 'Local GPU ready' : gpuStatus()}
          </div>
          <button
            type="button"
            aria-label="Run classic score"
            class={ui.button}
            disabled={running() || classicOpen()}
            onClick={() => void openClassicBenchmark()}
          >
            <span class={ui.desktopActionLabel}>Run classic score</span>
            <span class={ui.mobileActionLabel}>Classic</span>
          </button>
          <a class={ui.buttonQuiet} href="/" aria-label="Back to editor">
            <span class={ui.desktopActionLabel}>Back to editor</span>
            <span class={ui.mobileActionLabel}>Editor</span>
          </a>
        </div>
      </header>

      <div class={ui.shell}>
        <aside class={ui.sectionRail} aria-label="Benchmark sections">
          <nav class={ui.railInner}>
            <div class={ui.railLabel}>Run structure</div>
            <a class={ui.railItem} href="#benchmark-setup">
              <span class={ui.railIndex}>01</span>
              Setup
            </a>
            <a class={ui.railItem} href="#benchmark-corpus">
              <span class={ui.railIndex}>02</span>
              Flame corpus
            </a>
            <a class={ui.railItem} href="#benchmark-variation">
              <span class={ui.railIndex}>03</span>
              Variation lab
            </a>
            <a class={ui.railItem} href="#benchmark-run">
              <span class={ui.railIndex}>04</span>
              Run
            </a>
            <a class={ui.railItem} href="#benchmark-results">
              <span class={ui.railIndex}>05</span>
              Results
            </a>
            <p class={ui.railNote}>
              Manifests freeze every measured setting. Hidden-tab and
              device-loss samples never enter history.
            </p>
          </nav>
        </aside>

        <main class={ui.main}>
          <section class={ui.hero}>
            <div>
              <div class={ui.heroKicker}>
                Creative compute, measured honestly
              </div>
              <h1 class={ui.heroTitle}>
                Trace the speed of <em>chaos.</em>
              </h1>
              <p class={ui.heroBody}>
                A reproducible WebGPU workbench for renderer profiles, frozen
                flame corpora, and safe custom-variation A/B tests. The lab
                measures queue-completed points and keeps the raw schedule,
                samples, device fingerprint, and confidence interval.
              </p>
            </div>
            <dl class={ui.heroFacts}>
              <div class={ui.heroFact}>
                <span>Runner</span>
                <strong>lab-v1 · queue fenced</strong>
              </div>
              <div class={ui.heroFact}>
                <span>Adapter</span>
                <strong title={gpuLabel()}>{gpuLabel()}</strong>
              </div>
              <div class={ui.heroFact}>
                <span>Build</span>
                <strong>
                  {VERSION} · {GIT_SHA ? GIT_SHA.slice(0, 8) : 'development'}
                </strong>
              </div>
            </dl>
          </section>

          <FractalDivider id="hero" class={ui.divider} />

          <section id="benchmark-setup" class={ui.section}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionNumber}>01</span>
              <div>
                <h2 class={ui.sectionTitle}>Compose the run</h2>
                <p class={ui.sectionDescription}>
                  Choose an executable profile and freeze the settings that
                  affect the hot path.
                </p>
              </div>
              <p class={ui.sectionAside}>
                Reconstruction is separate from variation math. The A/B dial
                alternates order to reduce warm-up and drift bias.
              </p>
            </div>

            <div class={ui.setupGrid}>
              <div class={ui.controlSurface}>
                <div>
                  <div class={ui.surfaceEyebrow}>
                    <span>Chaos dial</span>
                    <span>{isComparison() ? 'paired' : 'single'}</span>
                  </div>
                  <ChaosDial
                    value={algorithm()}
                    onChange={changeAlgorithm}
                    disabled={running()}
                  />
                </div>
                <div class={ui.settingsColumn}>
                  <div class={ui.fieldStack}>
                    <div class={ui.fieldGroup}>
                      <div class={ui.fieldLabelRow}>
                        <span class={ui.fieldLabel}>Execution environment</span>
                        <span class={ui.fieldHint}>
                          Server executor planned
                        </span>
                      </div>
                      <div
                        class={ui.segmented}
                        aria-label="Execution environment"
                      >
                        <span
                          class={`${ui.segment} ${ui.segmentActive}`}
                          aria-current="true"
                        >
                          Local WebGPU
                        </span>
                        <button
                          type="button"
                          class={ui.segment}
                          title="Server-side execution is not implemented yet"
                          disabled
                        >
                          Server · later
                        </button>
                      </div>
                    </div>

                    <div class={ui.fieldGroup}>
                      <div class={ui.fieldLabelRow}>
                        <label class={ui.fieldLabel} for="benchmark-rng">
                          Random implementation
                        </label>
                        <span class={ui.fieldHint}>
                          {customLabEnabled()
                            ? 'Variation A/B owns both lanes'
                            : 'Paired A/B available'}
                        </span>
                      </div>
                      <select
                        id="benchmark-rng"
                        class={ui.select}
                        value={rngSelection()}
                        disabled={running()}
                        title="Choose one renderer output rule or compare the legacy and current TypeGPU-noise paths with the same state layout and initialization policy."
                        onChange={(event) => {
                          changeRngSelection(event.currentTarget.value)
                        }}
                      >
                        <For each={EXECUTABLE_RNG_IMPLEMENTATIONS}>
                          {(implementation) => (
                            <option value={implementation.id}>
                              {implementation.label}
                              {implementation.lifecycleStatus === 'current'
                                ? ' · current'
                                : ' · compatibility path'}
                            </option>
                          )}
                        </For>
                        <option
                          value={RNG_COMPARISON_SELECTION_ID}
                          disabled={customLabEnabled()}
                        >
                          Legacy ↔ TypeGPU noise · paired A/B
                        </option>
                        <For each={PLANNED_RNG_IMPLEMENTATIONS}>
                          {(implementation) => (
                            <option value={implementation.id} disabled>
                              {implementation.label} · adapter pending
                            </option>
                          )}
                        </For>
                      </select>
                    </div>

                    <div class={ui.settingsGrid}>
                      <div class={ui.fieldGroup}>
                        <label class={ui.fieldLabel} for="point-init-mode">
                          Point initialization
                        </label>
                        <select
                          id="point-init-mode"
                          class={ui.select}
                          value={settings().pointInitMode}
                          disabled={running()}
                          onChange={(event) => {
                            updateSetting(
                              'pointInitMode',
                              event.currentTarget.value as PointInitMode,
                            )
                          }}
                        >
                          <For each={POINT_INIT_OPTIONS}>
                            {(option) => (
                              <option value={option.value}>
                                {option.label}
                              </option>
                            )}
                          </For>
                        </select>
                      </div>
                      <div class={ui.fieldGroup}>
                        <label class={ui.fieldLabel} for="benchmark-resolution">
                          Accumulator
                        </label>
                        <select
                          id="benchmark-resolution"
                          class={ui.select}
                          value={settings().resolution}
                          disabled={running()}
                          onChange={(event) => {
                            updateSetting(
                              'resolution',
                              Number(event.currentTarget.value),
                            )
                          }}
                        >
                          <option value={512}>512 × 512</option>
                          <option value={1024}>1024 × 1024</option>
                          <option value={1440}>1440 × 1440</option>
                        </select>
                      </div>
                      <div class={ui.fieldGroup}>
                        <label class={ui.fieldLabel} for="point-batch">
                          Chains per batch
                        </label>
                        <select
                          id="point-batch"
                          class={ui.select}
                          value={settings().pointCountPerBatch}
                          disabled={running()}
                          onChange={(event) => {
                            updateSetting(
                              'pointCountPerBatch',
                              Number(event.currentTarget.value),
                            )
                          }}
                        >
                          <option value={131072}>131,072</option>
                          <option value={262144}>262,144</option>
                          <option value={524288}>524,288</option>
                        </select>
                      </div>
                      <div class={ui.fieldGroup}>
                        <label class={ui.fieldLabel} for="plots-per-chain">
                          Plots per chain
                        </label>
                        <select
                          id="plots-per-chain"
                          class={ui.select}
                          value={settings().plotsPerChain}
                          disabled={running()}
                          onChange={(event) => {
                            updateSetting(
                              'plotsPerChain',
                              Number(event.currentTarget.value),
                            )
                          }}
                        >
                          <option value={1}>1 · classic</option>
                          <option value={8}>8</option>
                          <option value={16}>16 · current</option>
                          <option value={32}>32</option>
                          <option value={64}>64</option>
                        </select>
                      </div>
                      <div class={ui.fieldGroup}>
                        <label class={ui.fieldLabel} for="skip-iters">
                          Fuse iterations
                        </label>
                        <input
                          id="skip-iters"
                          class={ui.numberInput}
                          type="number"
                          min="0"
                          max="30"
                          value={settings().skipIters}
                          disabled={running()}
                          onInput={(event) => {
                            updateSetting(
                              'skipIters',
                              Math.max(
                                0,
                                Math.min(30, Number(event.currentTarget.value)),
                              ),
                            )
                          }}
                        />
                      </div>
                      <div class={ui.fieldGroup}>
                        <span class={ui.fieldLabel}>Chain lifecycle</span>
                        <div class={ui.toggleRow}>
                          Persist between dispatches
                          <button
                            type="button"
                            role="switch"
                            aria-label="Persist chains between dispatches"
                            aria-checked={settings().persistChains}
                            class={ui.toggle}
                            classList={{
                              [ui.toggleOn!]: settings().persistChains,
                            }}
                            disabled={running()}
                            onClick={() => {
                              updateSetting(
                                'persistChains',
                                !settings().persistChains,
                              )
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div class={ui.fieldGroup}>
                      <div class={ui.fieldLabelRow}>
                        <span class={ui.fieldLabel}>Protocol</span>
                        <span class={ui.fieldHint}>{protocol().note}</span>
                      </div>
                      <div
                        class={ui.segmented}
                        role="group"
                        aria-label="Benchmark protocol"
                      >
                        <For
                          each={
                            Object.entries(PROTOCOLS) as [
                              ProtocolId,
                              (typeof PROTOCOLS)[ProtocolId],
                            ][]
                          }
                        >
                          {([id, value]) => (
                            <button
                              type="button"
                              class={ui.segment}
                              classList={{
                                [ui.segmentActive!]: protocolId() === id,
                              }}
                              aria-pressed={protocolId() === id}
                              disabled={running()}
                              onClick={() => setProtocolId(id)}
                              title={value.note}
                            >
                              {value.label}
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside class={ui.manifestSurface}>
                <div class={ui.surfaceEyebrow}>
                  <span>Frozen manifest preview</span>
                  <span>lab-v1</span>
                </div>
                <h3 class={ui.manifestTitle}>What this run will mean</h3>
                <p class={ui.manifestCopy}>
                  Every result keeps this configuration, the exact flame
                  snapshot, candidate identities, and raw sample order.
                </p>
                <dl class={ui.manifestRows}>
                  <div class={ui.manifestRow}>
                    <dt>Profile</dt>
                    <dd>{runProfileLabel()}</dd>
                  </div>
                  <div class={ui.manifestRow}>
                    <dt>Corpus</dt>
                    <dd>
                      {selectedSources().length}{' '}
                      {selectedSources().length === 1 ? 'flame' : 'flames'}
                    </dd>
                  </div>
                  <div class={ui.manifestRow}>
                    <dt>Schedule</dt>
                    <dd>
                      {protocol().warmupPairs} warm · {protocol().measuredPairs}{' '}
                      measured
                    </dd>
                  </div>
                  <div class={ui.manifestRow}>
                    <dt>Minimum work</dt>
                    <dd>
                      {formatCount(protocol().minimumCompletedPoints)} pts +{' '}
                      {protocol().minimumElapsedMs} ms
                    </dd>
                  </div>
                  <div class={ui.manifestRow}>
                    <dt>Point state</dt>
                    <dd>
                      {(memoryFootprint() / (1024 * 1024)).toFixed(1)} MiB · 32
                      B/chain
                    </dd>
                  </div>
                  <div class={ui.manifestRow}>
                    <dt>Timing</dt>
                    <dd>Queue-fenced wall clock</dd>
                  </div>
                </dl>
                <div class={ui.manifestFoot}>
                  <CheckIcon />
                  The first completed queue submission is warm-up and
                  contributes neither points nor time.
                </div>
              </aside>
            </div>
          </section>

          <FractalDivider id="corpus" class={ui.divider} />

          <section id="benchmark-corpus" class={ui.section}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionNumber}>02</span>
              <div>
                <h2 class={ui.sectionTitle}>Freeze a flame corpus</h2>
                <p class={ui.sectionDescription}>
                  Mix built-ins, local recents, ancestry, uploads, and seeded
                  surprises. Each flame becomes an independent stored result.
                </p>
              </div>
              <p class={ui.sectionAside}>
                Live previews mount only near this scroll viewport, settle after
                scrolling, snapshot, and release their GPU buffers.
              </p>
            </div>

            <div class={ui.corpusToolbar}>
              <div class={ui.sourceTabs} role="group" aria-label="Flame source">
                <For
                  each={
                    [
                      ['builtins', 'App gallery'],
                      ['recent', `Recent ${recentSources().length || ''}`],
                      [
                        'ancestry',
                        `Ancestry ${ancestrySources().length || ''}`,
                      ],
                      ['uploads', `Uploads ${uploadedSources().length || ''}`],
                      [
                        'generated',
                        `Surprises ${generatedSources().length || ''}`,
                      ],
                    ] as const
                  }
                >
                  {([id, label]) => (
                    <button
                      type="button"
                      aria-pressed={sourceTab() === id}
                      class={ui.sourceTab}
                      classList={{ [ui.sourceTabActive!]: sourceTab() === id }}
                      onClick={() => setSourceTab(id)}
                    >
                      {label}
                    </button>
                  )}
                </For>
              </div>
              <div class={ui.corpusActions}>
                <button
                  type="button"
                  class={ui.smallAction}
                  disabled={running()}
                  onClick={() => uploadInput?.click()}
                >
                  Upload flame
                </button>
                <button
                  type="button"
                  class={ui.smallAction}
                  disabled={running()}
                  onClick={addSurprise}
                >
                  Surprise me
                </button>
              </div>
              <input
                ref={uploadInput}
                class={ui.uploadInput}
                type="file"
                accept=".flame,.xml,.png,image/png"
                multiple
                onChange={(event) => {
                  if (event.currentTarget.files) {
                    void importFiles(event.currentTarget.files)
                  }
                  event.currentTarget.value = ''
                }}
              />
            </div>

            <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
              <div
                class={ui.galleryShell}
                onDragOver={(event) => {
                  event.preventDefault()
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  const files = event.dataTransfer?.files
                  if (!running() && files && files.length > 0) {
                    void importFiles(files)
                  }
                }}
              >
                <div ref={setGalleryElement} class={ui.gallery}>
                  <For each={visibleSources()}>
                    {(source) => (
                      <FlameTile
                        source={source}
                        selected={selectedIds().includes(source.id)}
                        paused={running() || classicOpen()}
                        previewEnabled={gpuStatus() === 'ready'}
                        scrolling={galleryScrolling()}
                        trackActivation={trackTileActivation}
                        trackVisibility={trackTileVisibility}
                        onToggle={() => {
                          toggleSource(source.id)
                        }}
                      />
                    )}
                  </For>
                  <Show when={visibleSources().length === 0}>
                    <div class={ui.resultsEmpty}>
                      <FlameGlyph />
                      <strong>
                        {ancestryLoading()
                          ? 'Loading local ancestry…'
                          : 'No flames in this local source yet'}
                      </strong>
                      <span>
                        {ancestryLoading()
                          ? 'Reading saved generations and preparing their benchmark snapshots.'
                          : 'Upload a PNG/flame XML, save a flame in the editor, or generate a deterministic surprise.'}
                      </span>
                    </div>
                  </Show>
                </div>
                <div class={ui.galleryFoot}>
                  <span>
                    <strong>{selectedSources().length}</strong> selected across
                    all sources
                  </span>
                  <button
                    type="button"
                    class={ui.smallAction}
                    disabled={running() || visibleSources().length === 0}
                    onClick={selectVisible}
                  >
                    Toggle visible
                  </button>
                </div>
              </div>
            </ComputeGate>
          </section>

          <FractalDivider id="variation" class={ui.divider} />

          <section id="benchmark-variation" class={ui.section}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionNumber}>03</span>
              <div>
                <h2 class={ui.sectionTitle}>Variation lab</h2>
                <p class={ui.sectionDescription}>
                  Start from a documented built-in, rewrite its safe function
                  body, and run a controlled paired benchmark.
                </p>
              </div>
              <p class={ui.sectionAside}>
                Transient candidates use the same allowlisted compiler as the
                editor. They are unregistered as soon as the run finishes.
              </p>
            </div>

            <Show when={!customCompatible() && selectedSources().length > 0}>
              <div class={ui.noticeBanner}>
                <PulseIcon />
                Variation A/B is currently 2D-only. Remove 3D workloads to
                enable it; general renderer benchmarks remain available.
              </div>
            </Show>

            <div class={ui.variationLayout}>
              <div class={ui.variationMain}>
                <div class={ui.templateStrip}>
                  <For each={VARIATION_TEMPLATES}>
                    {(template) => (
                      <button
                        type="button"
                        aria-pressed={template.id === templateId()}
                        class={ui.templateButton}
                        classList={{
                          [ui.templateButtonActive!]:
                            template.id === templateId(),
                        }}
                        disabled={running()}
                        onClick={() => {
                          chooseTemplate(template)
                        }}
                      >
                        <strong>{template.label}</strong>
                        <span>{template.variationType}</span>
                      </button>
                    )}
                  </For>
                </div>
                <div class={ui.editorHeader}>
                  <span>
                    Candidate body · <code>(pos, varInfo) → vec2f</code>
                  </span>
                  <span>
                    Ctrl/⌘ + Enter validates · Esc then Tab leaves editor
                  </span>
                </div>
                <div class={ui.editorFrame}>
                  <WgslEditor
                    ariaLabel="Custom variation candidate"
                    code={candidateCode()}
                    readOnly={running()}
                    onChange={(code) => {
                      setCandidateCode(code)
                      setCompileState({
                        status: 'dirty',
                        message: 'Candidate changed — validate before running',
                      })
                    }}
                    onCtrlEnter={() => {
                      validateCandidate()
                    }}
                  />
                </div>
                <div class={ui.compileBar}>
                  <div class={ui.compileState}>
                    <span
                      class={ui.compileDot}
                      classList={{
                        [ui.compileValid!]: compileState().status === 'valid',
                        [ui.compileInvalid!]:
                          compileState().status === 'invalid',
                      }}
                    />
                    <span title={compileState().message}>
                      {compileState().message}
                    </span>
                  </div>
                  <button
                    type="button"
                    class={ui.smallAction}
                    disabled={running()}
                    onClick={() => {
                      validateCandidate()
                    }}
                  >
                    Validate candidate
                  </button>
                </div>
              </div>

              <aside class={ui.variationAside}>
                <div class={ui.surfaceEyebrow}>
                  <span>Controlled comparison</span>
                  <span>safe subset</span>
                </div>
                <h3 class={ui.variationHeading}>{selectedTemplate().label}</h3>
                <p class={ui.variationCopy}>
                  {templateDocumentation()?.summary ??
                    'Documented built-in variation baseline.'}
                </p>
                <div class={ui.comparisonDiagram}>
                  <div class={ui.comparisonLane}>
                    <span>A</span>
                    <strong>{selectedTemplate().label} built-in</strong>
                    <code>{selectedTemplate().variationType}</code>
                  </div>
                  <div class={ui.comparisonLane}>
                    <span>B</span>
                    <strong>Your transient candidate</strong>
                    <code>custom_preview_*</code>
                  </div>
                </div>
                <ul class={ui.safetyList}>
                  <li>
                    <CheckIcon />
                    Storage, atomics, textures, dynamic loops, and unknown
                    identifiers are rejected.
                  </li>
                  <li>
                    <CheckIcon />
                    Both lanes receive the same frozen 2D flame structure and
                    balanced AB/BA schedule.
                  </li>
                  <li>
                    <CheckIcon />
                    “Correctness passed” means safe compilation plus a non-blank
                    render smoke check—not mathematical equivalence.
                  </li>
                </ul>
                <div class={ui.toggleRow} style={{ 'margin-top': '18px' }}>
                  Use variation A/B for next run
                  <button
                    type="button"
                    role="switch"
                    aria-label="Use variation A/B for next run"
                    aria-checked={customLabEnabled()}
                    class={ui.toggle}
                    classList={{ [ui.toggleOn!]: customLabEnabled() }}
                    disabled={running() || !customCompatible()}
                    onClick={toggleCustomLab}
                  />
                </div>
              </aside>
            </div>
          </section>

          <FractalDivider id="run" class={ui.divider} />

          <section id="benchmark-run" class={ui.section}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionNumber}>04</span>
              <div>
                <h2 class={ui.sectionTitle}>Run the frozen plan</h2>
                <p class={ui.sectionDescription}>
                  Gallery previews stop before the first warm-up. Keep this tab
                  visible and avoid other GPU-heavy work until completion.
                </p>
              </div>
              <p class={ui.sectionAside}>
                Runs are sequential by design: one canvas, one workload, one
                candidate, and one queue-completed sample at a time.
              </p>
            </div>

            <Show when={runError()}>
              {(error) => (
                <div class={ui.errorBanner}>
                  <PulseIcon />
                  {error()}
                </div>
              )}
            </Show>

            <div class={ui.runSurface}>
              <div class={ui.runSummary}>
                <div class={ui.runHeading}>
                  <span class={ui.runGlyph}>
                    <PulseIcon />
                  </span>
                  <div>
                    <h3>{runProfileLabel()}</h3>
                    <p>
                      {selectedSources().length} workload
                      {selectedSources().length === 1 ? '' : 's'} ·{' '}
                      {scheduleLengthPerFlame()} samples each
                    </p>
                  </div>
                </div>
                <div class={ui.runFacts}>
                  <span class={ui.runFact}>
                    <strong>{PROTOCOLS[protocolId()].label}</strong> protocol
                  </span>
                  <span class={ui.runFact}>
                    <strong>{settings().resolution}²</strong> accumulator
                  </span>
                  <span class={ui.runFact}>
                    <strong>{settings().plotsPerChain}</strong> plots/chain
                  </span>
                  <span class={ui.runFact}>
                    <strong>{selectedRng().stateBytes} B</strong> RNG state
                  </span>
                </div>
              </div>
              <div class={ui.runAction}>
                <button
                  type="button"
                  class={ui.runButton}
                  classList={{ [ui.runButtonCancel!]: running() }}
                  disabled={
                    !running() &&
                    (gpuStatus() !== 'ready' ||
                      selectedSources().length === 0 ||
                      (customLabEnabled() && !customCompatible()))
                  }
                  onClick={() => {
                    if (running()) cancelRun()
                    else void runBenchmarks()
                  }}
                >
                  {running() ? 'Cancel cleanly' : 'Run benchmark plan'}
                </button>
                <span class={ui.runEstimate}>
                  {running()
                    ? `${runProgress()?.flameLabel ?? 'Preparing'} · ${
                        runProgress()?.candidateLabel ?? ''
                      }`
                    : `Estimated minimum ${estimatedDurationSeconds()} s`}
                </span>
              </div>
              <Show when={running()}>
                <div class={ui.progressArea}>
                  <div class={ui.progressHeader}>
                    <span>
                      {runProgress()?.completedSamples ?? 0} /{' '}
                      {runProgress()?.totalSamples ?? 0} samples
                    </span>
                    <span>
                      {formatRate(runProgress()?.pointsPerSecond, true)}
                    </span>
                  </div>
                  <div
                    class={ui.progressTrack}
                    role="progressbar"
                    aria-label="Benchmark progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={progressPercent()}
                  >
                    <div
                      class={ui.progressFill}
                      style={{
                        transform: `scaleX(${progressPercent() / 100})`,
                      }}
                    />
                  </div>
                </div>
              </Show>
            </div>
          </section>

          <FractalDivider id="results" class={ui.divider} />

          <section id="benchmark-results" class={ui.section}>
            <div class={ui.sectionHeader}>
              <span class={ui.sectionNumber}>05</span>
              <div>
                <h2 class={ui.sectionTitle}>Read the attractor</h2>
                <p class={ui.sectionDescription}>
                  Median throughput leads; variability, paired change, interval,
                  and every raw sample remain visible and exportable.
                </p>
              </div>
              <p class={ui.sectionAside}>
                Compare only matching manifests and device conditions. Cross-GPU
                scores describe hardware as much as code.
              </p>
            </div>

            <Show
              when={completedRuns().length > 0}
              fallback={
                <div class={ui.resultsEmpty}>
                  <PulseIcon />
                  <strong>No measured result yet</strong>
                  <span>
                    Configure a small corpus and run the Quick protocol. This
                    area never fabricates preview scores.
                  </span>
                </div>
              }
            >
              <div class={ui.resultStack}>
                <For each={completedRuns()}>
                  {(run) => {
                    const candidateSummary = () =>
                      run.result.candidates.at(-1)?.throughput
                    const baselineSummary = () =>
                      run.result.candidates[0]?.throughput
                    const primary = candidateSummary
                    const samples = () =>
                      run.result.samples.filter(
                        (sample) =>
                          sample.phase === 'measured' &&
                          sample.status === 'valid',
                      )
                    const maxThroughput = () =>
                      Math.max(
                        1,
                        ...samples().map((sample) => sample.throughput ?? 0),
                      )
                    return (
                      <article class={ui.resultCard}>
                        <div class={ui.attractorCore}>
                          <svg
                            class={ui.coreSvg}
                            viewBox={`0 0 ${BENCHMARK_DIAL.size} ${BENCHMARK_DIAL.size}`}
                            aria-hidden="true"
                          >
                            <circle
                              class={ui.dialOuterRing}
                              cx={BENCHMARK_DIAL.center}
                              cy={BENCHMARK_DIAL.center}
                              r={BENCHMARK_DIAL.outerRadius}
                            />
                            <For each={BENCHMARK_DIAL.orbits}>
                              {(orbit) => (
                                <ellipse
                                  class={`${ui.dialOrbit} ${
                                    orbit.tone === 'ember'
                                      ? ui.dialOrbitEmber
                                      : ui.dialOrbitCyan
                                  }`}
                                  cx={BENCHMARK_DIAL.center}
                                  cy={BENCHMARK_DIAL.center}
                                  rx={orbit.rx}
                                  ry={orbit.ry}
                                  transform={`rotate(${orbit.rotation} ${BENCHMARK_DIAL.center} ${BENCHMARK_DIAL.center})`}
                                  style={{ opacity: orbit.opacity }}
                                />
                              )}
                            </For>
                            <path
                              class={ui.dialEmberArc}
                              d={BENCHMARK_DIAL_EMBER_ARC}
                            />
                            <For each={BENCHMARK_DIAL_EMBER_NODES}>
                              {(node) => (
                                <circle
                                  class={ui.dialEmberNode}
                                  cx={node.x}
                                  cy={node.y}
                                  r={node.radius}
                                  style={{ opacity: node.opacity }}
                                />
                              )}
                            </For>
                            <circle
                              class={ui.dialInnerRing}
                              cx={BENCHMARK_DIAL.center}
                              cy={BENCHMARK_DIAL.center}
                              r={BENCHMARK_DIAL.innerRadius}
                            />
                          </svg>
                          <div class={ui.coreValue}>
                            <strong>
                              {run.result.comparison
                                ? `${
                                    run.result.comparison.percentChange >= 0
                                      ? '+'
                                      : ''
                                  }${run.result.comparison.percentChange.toFixed(
                                    2,
                                  )}%`
                                : formatRate(primary()?.median, true)}
                            </strong>
                            <span>
                              {run.result.comparison
                                ? 'paired change'
                                : 'median throughput'}
                            </span>
                            <Show when={run.result.comparison}>
                              {(comparison) => (
                                <small>
                                  {comparison().pairedSampleCount} pairs ·{' '}
                                  {formatSignedPercent(
                                    (comparison().confidenceInterval.low - 1) *
                                      100,
                                  )}{' '}
                                  to{' '}
                                  {formatSignedPercent(
                                    (comparison().confidenceInterval.high - 1) *
                                      100,
                                  )}{' '}
                                  CI
                                </small>
                              )}
                            </Show>
                          </div>
                          <span class={ui.coreBadge}>
                            {run.result.validation.status}
                          </span>
                        </div>
                        <div class={ui.resultBody}>
                          <div class={ui.resultTopline}>
                            <div>
                              <h3>{run.manifest.workload.flame.label}</h3>
                              <p>
                                {run.manifest.candidates
                                  .map((candidate) => candidate.label)
                                  .join(' ↔ ')}
                                <Show
                                  when={
                                    run.result.comparison &&
                                    run.manifest.candidates[1]?.id.startsWith(
                                      'variation:custom:',
                                    )
                                  }
                                >
                                  {' · '}
                                  {correctnessLabel(
                                    run.result.comparison!.correctness,
                                  )}
                                </Show>
                              </p>
                            </div>
                            <span class={ui.verdict}>
                              {run.result.comparison
                                ? BENCHMARK_COMPARISON_VERDICT_LABELS[
                                    run.result.comparison.verdict
                                  ]
                                : 'Single profile'}
                            </span>
                          </div>
                          <div class={ui.metricGrid}>
                            <div class={ui.metric}>
                              <span>
                                {run.result.comparison
                                  ? 'A · baseline median'
                                  : 'Median'}
                              </span>
                              <strong>
                                {formatRate(baselineSummary()?.median)}
                              </strong>
                              <small>
                                {baselineSummary()?.confidenceInterval
                                  ? `${formatRate(
                                      baselineSummary()!.confidenceInterval.low,
                                      true,
                                    )}–${formatRate(
                                      baselineSummary()!.confidenceInterval
                                        .high,
                                      true,
                                    )} · 95% CI`
                                  : 'No interval'}
                              </small>
                            </div>
                            <div class={ui.metric}>
                              <span>
                                {run.result.comparison
                                  ? 'B · candidate median'
                                  : 'Paired change'}
                              </span>
                              <strong>
                                {run.result.comparison
                                  ? formatRate(candidateSummary()?.median)
                                  : '—'}
                              </strong>
                              <small>
                                {run.result.comparison
                                  ? candidateSummary()?.confidenceInterval
                                    ? `${formatRate(
                                        candidateSummary()!.confidenceInterval
                                          .low,
                                        true,
                                      )}–${formatRate(
                                        candidateSummary()!.confidenceInterval
                                          .high,
                                        true,
                                      )} · 95% CI`
                                    : 'No interval'
                                  : 'No reference lane'}
                              </small>
                            </div>
                            <div class={ui.metric}>
                              <span>Stability</span>
                              <strong>
                                {primary()?.cv === undefined
                                  ? '—'
                                  : `${(primary()!.cv! * 100).toFixed(1)}%`}
                              </strong>
                              <small>coefficient of variation</small>
                            </div>
                          </div>
                          <div
                            class={ui.sampleBars}
                            aria-label="Measured sample throughput distribution"
                          >
                            <For each={samples()}>
                              {(sample) => (
                                <span
                                  class={ui.sampleBar}
                                  classList={{
                                    [ui.sampleBarCandidate!]:
                                      run.manifest.mode === 'comparison' &&
                                      sample.candidateId ===
                                        run.manifest.candidates[1].id,
                                  }}
                                  style={{
                                    height: `${Math.max(
                                      8,
                                      ((sample.throughput ?? 0) /
                                        maxThroughput()) *
                                        100,
                                    )}%`,
                                  }}
                                  title={`${sample.candidateId}: ${formatRate(
                                    sample.throughput ?? undefined,
                                  )}`}
                                />
                              )}
                            </For>
                          </div>
                          <details class={ui.sampleDetails}>
                            <summary>Raw measured samples</summary>
                            <div class={ui.sampleTable}>
                              <table>
                                <thead>
                                  <tr class={ui.sampleTableHead}>
                                    <th scope="col">Lane</th>
                                    <th scope="col">Pair</th>
                                    <th scope="col">Time</th>
                                    <th scope="col">Completed work</th>
                                    <th scope="col">Throughput</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <For each={samples()}>
                                    {(sample) => (
                                      <tr class={ui.sampleTableRow}>
                                        <td>
                                          {run.manifest.candidates.find(
                                            ({ id }) =>
                                              id === sample.candidateId,
                                          )?.label ?? sample.candidateId}
                                        </td>
                                        <td>{sample.pairIndex + 1}</td>
                                        <td>
                                          {sample.elapsedMs?.toFixed(1)} ms
                                        </td>
                                        <td>
                                          {formatCount(
                                            sample.completedWork ?? 0,
                                          )}
                                        </td>
                                        <td>
                                          {formatRate(
                                            sample.throughput ?? undefined,
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </For>
                                </tbody>
                              </table>
                            </div>
                          </details>
                          <div class={ui.resultActions}>
                            <button
                              type="button"
                              class={ui.smallAction}
                              onClick={() => {
                                downloadTextFile(
                                  createBenchmarkJsonExport(
                                    run.manifest,
                                    run.result,
                                  ),
                                )
                              }}
                            >
                              JSON
                            </button>
                            <button
                              type="button"
                              class={ui.smallAction}
                              onClick={() => {
                                downloadTextFile(
                                  createBenchmarkCsvExport(
                                    run.manifest,
                                    run.result,
                                  ),
                                )
                              }}
                            >
                              CSV
                            </button>
                            <button
                              type="button"
                              class={ui.smallAction}
                              onClick={() => {
                                drawShareCard(run)
                              }}
                            >
                              Share card PNG
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  }}
                </For>
              </div>
            </Show>

            <Show when={history().length > 0}>
              <div class={ui.history}>
                <div class={ui.historyHeader}>
                  <strong>Local result history</strong>
                  <span>Newest eight · IndexedDB</span>
                </div>
                <For each={history()}>
                  {(entry) => (
                    <div class={ui.historyRow}>
                      <strong>{entry.manifest.workload.flame.label}</strong>
                      <span>
                        {new Date(entry.savedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                      <span>
                        {entry.result.candidates.at(-1)?.throughput
                          ? formatRate(
                              entry.result.candidates.at(-1)!.throughput!
                                .median,
                              true,
                            )
                          : '—'}
                      </span>
                      <span>
                        {entry.result.comparison
                          ? `${
                              entry.result.comparison.percentChange >= 0
                                ? '+'
                                : ''
                            }${entry.result.comparison.percentChange.toFixed(
                              2,
                            )}%`
                          : 'single profile'}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <footer class={ui.footer}>
            <span>
              Local results stay in this browser until you export or clear them.
              Current TypeGPU-noise xoroshiro64** and the former state-word
              output share the same vec2u layout and initialization policy; the
              paired run measures their end-to-end renderer throughput impact.
              LCG32 remains disabled until its u32 load/sample/store adapter is
              release-gated.
            </span>
            <button
              type="button"
              class={ui.smallAction}
              disabled={running() || history().length === 0}
              onClick={() => void clearLocalHistory()}
            >
              Clear local history
            </button>
          </footer>
        </main>
      </div>

      <Show when={activeSample()} keyed>
        {(sample) => (
          <BenchmarkRunnerHost
            flame={sample.flame}
            width={sample.resolution}
            height={sample.resolution}
            pointCountPerBatch={sample.pointCountPerBatch}
            minimumCompletedPoints={sample.minimumCompletedPoints}
            minimumElapsedMs={sample.minimumElapsedMs}
            maximumElapsedMs={sample.maximumElapsedMs}
            stochasticFilterEnabled={sample.stochasticFilterEnabled}
            randomImplementationId={sample.randomImplementationId}
            persistChains={sample.persistChains}
            onProgress={sample.onProgress}
            onComplete={sample.onComplete}
            onError={sample.onError}
          />
        )}
      </Show>
    </div>
  )
}
