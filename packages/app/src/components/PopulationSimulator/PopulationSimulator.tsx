import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { DelayedShow } from '@/components/DelayedShow/DelayedShow'
import { ModalTitleBar } from '@/components/Modal/ModalTitleBar'
import { VariationPreview } from '@/components/VariationSelector/VariationSelector'
import { ComputeGate } from '@/contexts/ComputeGateContext'
import { COMPUTE_GATE_CAPACITY } from '@/defaults'
import { ensureNode } from '@/flame/ancestry'
import { breedFlames } from '@/flame/breedFlame'
import { scoreFlame } from '@/flame/fitness'
import { generateRandomFlame, mutateFlame } from '@/flame/randomize'
import { deepClone } from '@/utils/clone'
import ui from './PopulationSimulator.module.css'
import type { CrossoverMode } from '@/flame/breedFlame'
import type { MutateFlameOptions } from '@/flame/randomize'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { HardwareTier } from '@/utils/hardwareTier'

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_GENERATIONS = 500
const MIN_POPULATION = 8
const MAX_POPULATION = 256
const POP_STEP = 8
const CROSSOVER_MODES: CrossoverMode[] = [
  'uniform',
  'weighted',
  'shuffle',
  'alternate',
  'smart',
]
const CROSSOVER_LABELS: Record<CrossoverMode, string> = {
  uniform: 'Uniform',
  weighted: 'Weighted',
  shuffle: 'Shuffle',
  alternate: 'Alternate',
  smart: 'Smart',
}

const PREVIEW_RESOLUTION: Record<
  HardwareTier,
  { width: number; height: number }
> = {
  low: { width: 256, height: 144 },
  mid: { width: 384, height: 216 },
  high: { width: 640, height: 360 },
  ultra: { width: 768, height: 432 },
}

/** Max items to show initially in result grids — rest expand via "Show more". */
const INITIAL_VISIBLE = 8
/** Stagger delay between preview mounts to avoid GPU spikes. */
const STAGGER_DELAY_MS = 40

// ── Types ────────────────────────────────────────────────────────────────────

type SelectionStrategy = 'truncation' | 'tournament' | 'roulette'

interface ScoredFlame {
  flame: FlameDescriptor
  score: number
  index: number
}

interface GenerationResult {
  generation: number
  population: ScoredFlame[]
  best: ScoredFlame
  avgScore: number
}

type SimState = 'idle' | 'running' | 'paused' | 'complete'

// ── Helpers ──────────────────────────────────────────────────────────────────

function pickTwoRandom<T>(arr: T[]): [T, T] {
  const a = Math.floor(Math.random() * arr.length)
  let b = Math.floor(Math.random() * arr.length)
  while (b === a && arr.length > 1) b = Math.floor(Math.random() * arr.length)
  return [arr[a]!, arr[b]!]
}

function scorePopulation(flames: FlameDescriptor[]): ScoredFlame[] {
  return flames
    .map((flame, index) => ({
      flame,
      score: scoreFlame(flame).composite,
      index,
    }))
    .sort((a, b) => b.score - a.score)
}

function selectTruncation(
  scored: ScoredFlame[],
  pressure: number,
  targetCount: number,
): FlameDescriptor[] {
  const keepCount = Math.max(2, Math.floor(scored.length * (1 - pressure)))
  const survivors = scored.slice(0, keepCount).map((s) => s.flame)
  const parents: FlameDescriptor[] = []
  for (let i = 0; i < targetCount; i++) {
    parents.push(
      deepClone(survivors[Math.floor(Math.random() * survivors.length)]!),
    )
  }
  return parents
}

function selectTournament(
  scored: ScoredFlame[],
  pressure: number,
  targetCount: number,
): FlameDescriptor[] {
  const k = Math.max(2, Math.ceil(scored.length * pressure))
  const parents: FlameDescriptor[] = []
  for (let i = 0; i < targetCount; i++) {
    // Pick k random candidates, best one wins
    let best: ScoredFlame | null = null
    for (let j = 0; j < k; j++) {
      const candidate = scored[Math.floor(Math.random() * scored.length)]!
      if (!best || candidate.score > best.score) best = candidate
    }
    parents.push(deepClone(best!.flame))
  }
  return parents
}

function selectRoulette(
  scored: ScoredFlame[],
  _pressure: number,
  targetCount: number,
): FlameDescriptor[] {
  // Shift scores to be non-negative for roulette wheel
  const minScore = scored[scored.length - 1]!.score
  const shifted = scored.map((s) => ({
    ...s,
    adjusted: s.score - minScore + 0.01,
  }))
  const total = shifted.reduce((sum, s) => sum + s.adjusted, 0)

  const parents: FlameDescriptor[] = []
  for (let i = 0; i < targetCount; i++) {
    let r = Math.random() * total
    for (const s of shifted) {
      r -= s.adjusted
      if (r <= 0) {
        parents.push(deepClone(s.flame))
        break
      }
    }
    if (parents.length <= i) {
      // Fallback in case of floating point issues — `scored` is sorted
      // descending, so index 0 is the best individual, not the worst.
      parents.push(deepClone(shifted[0]!.flame))
    }
  }
  return parents
}

function selectParents(
  scored: ScoredFlame[],
  strategy: SelectionStrategy,
  pressure: number,
  targetCount: number,
): FlameDescriptor[] {
  switch (strategy) {
    case 'truncation':
      return selectTruncation(scored, pressure, targetCount)
    case 'tournament':
      return selectTournament(scored, pressure, targetCount)
    case 'roulette':
      return selectRoulette(scored, pressure, targetCount)
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function PopulationSimulator(props: {
  flame: FlameDescriptor
  hardwareTier?: HardwareTier | null
  onApply: (flame: FlameDescriptor) => void
  respond: () => void
}) {
  const tier = () => props.hardwareTier ?? 'mid'
  const resolution = () => PREVIEW_RESOLUTION[tier()]

  // ── Config signals ──────────────────────────────────────────────────────

  const [populationSize, setPopulationSize] = createSignal(48)
  const [generations, setGenerations] = createSignal(10)
  const [selectionPressure, setSelectionPressure] = createSignal(0.3)
  const [crossoverMode, setCrossoverMode] =
    createSignal<CrossoverMode>('uniform')
  const [mutationStrength, setMutationStrength] = createSignal(0.2)
  const [selectionStrategy, setSelectionStrategy] =
    createSignal<SelectionStrategy>('truncation')

  // ── State ────────────────────────────────────────────────────────────────

  const [simState, setSimState] = createSignal<SimState>('idle')
  const [currentGen, setCurrentGen] = createSignal(0)
  const [genResults, setGenResults] = createSignal<GenerationResult[]>([])
  const [livePopulation, setLivePopulation] = createSignal<ScoredFlame[]>([])
  const [bestEver, setBestEver] = createSignal<ScoredFlame | null>(null)
  const [elapsed, setElapsed] = createSignal(0)
  const [selectedFlame, setSelectedFlame] =
    createSignal<FlameDescriptor | null>(null)

  // ── Staggered visibility for result grids ─────────────────────────────────

  const [visibleGenCount, setVisibleGenCount] = createSignal(INITIAL_VISIBLE)
  const [visibleFullPopCount, setVisibleFullPopCount] =
    createSignal(INITIAL_VISIBLE)

  let stopRequested = false
  let pauseRequested = false
  let timerInterval: ReturnType<typeof setInterval> | null = null
  // Population already bred for the next generation when a pause lands between
  // generations — resume() picks it up so the bred children aren't discarded.
  let pendingPopulation: FlameDescriptor[] | null = null

  // Unmount safety: closing the modal mid-run (e.g. "Use This Flame" while
  // paused) must halt the loop and the elapsed-time interval.
  onCleanup(() => {
    stopRequested = true
    stopTimer()
  })

  // ── Mutation options (light, just for population diversity) ────────────

  const mutationOptions: MutateFlameOptions = {
    mutateAffine: true,
    affineMode: 'smart',
    mutateVariations: 'modify',
    mutateColors: true,
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  const progressPct = createMemo(() =>
    generations() > 0 ? ((currentGen() + 1) / generations()) * 100 : 0,
  )

  const topN = createMemo(() => livePopulation().slice(0, 12))

  const topThree = createMemo(() => {
    const all = genResults()
    if (all.length === 0) return []
    // Best flame from each of the last generations, capped at top 3
    const bests = all.map((r) => r.best).sort((a, b) => b.score - a.score)
    return bests.slice(0, 3)
  })

  // ── Timer ───────────────────────────────────────────────────────────────

  function startTimer() {
    const start = Date.now() - elapsed() * 1000
    timerInterval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 250)
  }

  function stopTimer() {
    if (timerInterval !== null) {
      clearInterval(timerInterval)
      timerInterval = null
    }
  }

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── Core loop ───────────────────────────────────────────────────────────

  function initPopulation(): FlameDescriptor[] {
    const dims = props.flame.renderSettings?.dimensions ?? 2
    const pop: FlameDescriptor[] = []
    for (let i = 0; i < populationSize(); i++) {
      pop.push(
        generateRandomFlame({
          strength: 0.7,
          minTransforms: 3,
          maxTransforms: 6,
          minVariations: 1,
          maxVariations: 3,
          dimensions: dims,
          allowedVariations: [],
        }),
      )
    }
    return pop
  }

  function runGeneration(
    population: FlameDescriptor[],
    genIdx: number,
  ): GenerationResult {
    // Score
    const scored = scorePopulation(population)
    const best = scored[0]!
    const avgScore = scored.reduce((s, f) => s + f.score, 0) / scored.length

    const result: GenerationResult = {
      generation: genIdx,
      population: scored,
      best,
      avgScore,
    }

    // Update live view
    setLivePopulation(scored)
    setCurrentGen(genIdx)
    if (!bestEver() || best.score > bestEver()!.score) {
      setBestEver(best)
    }

    return result
  }

  function breedNextGeneration(scored: ScoredFlame[]): FlameDescriptor[] {
    const strat = selectionStrategy()
    const pressure = selectionPressure()
    const popSize = populationSize()

    // Select parents (we need roughly popSize parents for breeding pairs)
    const parentPool = selectParents(scored, strat, pressure, popSize)

    // Elitism: keep top 2
    const elite = scored.slice(0, 2).map((s) => deepClone(s.flame))

    // Breed children
    const children: FlameDescriptor[] = [...elite]
    const breedCfg = {
      count: 2,
      crossoverMode: crossoverMode(),
      mutationStrength: mutationStrength(),
    }

    // Note: simulator breeds are deliberately NOT recorded into the ancestry
    // store — a run produces thousands of throwaway flames that would flood
    // IndexedDB and drown the Ancestry Tree. Applied results are registered
    // via ensureNode() in applyFlame() instead.
    while (children.length < popSize) {
      const [a, b] = pickTwoRandom(parentPool)
      const offspring = breedFlames(a, b, breedCfg)
      if (offspring.length === 0) {
        // Degenerate parents — carry one through unchanged so the loop
        // always makes progress.
        children.push(deepClone(a))
        continue
      }
      for (const child of offspring) {
        if (children.length >= popSize) break
        children.push(child)
      }
    }

    // Apply light mutation for diversity (skip elite clones)
    const mutated = children.map((c, i) =>
      i < elite.length
        ? c
        : mutateFlame(
            c,
            {
              strength: mutationStrength() * 0.5,
              minTransforms: 1,
              maxTransforms: 6,
              minVariations: 1,
              maxVariations: 3,
              allowedVariations: [],
            },
            mutationOptions,
          ),
    )

    return mutated
  }

  /** Shared generation loop for run() and resume(). */
  async function runLoop(
    startGen: number,
    initialPopulation: FlameDescriptor[],
    results: GenerationResult[],
  ) {
    let population = initialPopulation
    const totalGens = generations()

    for (let gen = startGen; gen < totalGens; gen++) {
      // Check for stop/pause
      if (stopRequested) break
      if (pauseRequested) {
        // `population` is the already-bred next generation — stash it so
        // resume() continues with it instead of re-breeding from the last
        // scored generation (which would silently discard these children).
        pendingPopulation = population
        stopTimer()
        setSimState('paused')
        return // caller re-enters via resume()
      }

      // Run this generation
      const result = runGeneration(population, gen)
      results.push(result)
      setGenResults([...results])

      // Yield to UI
      await new Promise((r) => setTimeout(r, 0))

      // Breed next gen (unless it's the last)
      if (gen < totalGens - 1) {
        population = breedNextGeneration(result.population)
      }
    }

    stopTimer()
    setSimState('complete')
  }

  async function run() {
    if (simState() === 'running') return
    stopRequested = false
    pauseRequested = false
    pendingPopulation = null
    setSimState('running')
    setGenResults([])
    setBestEver(null)
    setElapsed(0)
    startTimer()

    await runLoop(0, initPopulation(), [])
  }

  function start() {
    setVisibleGenCount(INITIAL_VISIBLE)
    setVisibleFullPopCount(INITIAL_VISIBLE)
    void run()
  }

  function pause() {
    pauseRequested = true
  }

  function resume() {
    if (simState() !== 'paused') return
    pauseRequested = false
    setSimState('running')
    startTimer()
    // Continue from where we left off, preferring the generation that was
    // already bred when the pause landed.
    const results = [...genResults()]
    const population =
      pendingPopulation ?? livePopulation().map((s) => deepClone(s.flame))
    pendingPopulation = null
    void runLoop(results.length, population, results)
  }

  function stop() {
    stopRequested = true
    stopTimer()
    // Preserve results — go to 'complete' so user can still load flames.
    // If the loop is still running it will also set 'complete' on exit (idempotent).
    if (simState() === 'paused') {
      setSimState('complete')
    }
    // If running, the active loop will call setSimState('complete') when it exits.
  }

  function applyFlame(flame: FlameDescriptor) {
    // Register the kept flame as an ancestry root (simulator breeds aren't
    // recorded — see breedNextGeneration) so it participates in future
    // lineage once the user breeds with it.
    ensureNode(flame)
    props.onApply(deepClone(flame))
    props.respond()
  }

  // ── Render helpers ──────────────────────────────────────────────────────

  const isRunning = () => simState() === 'running'
  const isPaused = () => simState() === 'paused'
  const isComplete = () => simState() === 'complete'
  const isIdle = () => simState() === 'idle'
  const canStart = () => isIdle() || isComplete()
  const canPause = () => isRunning()
  const canResume = () => isPaused()
  const canStop = () => isRunning() || isPaused()

  return (
    <div class={ui.modal}>
      <ModalTitleBar
        onClose={() => {
          stop()
          props.respond()
        }}
      >
        <span>Population Simulator</span>
      </ModalTitleBar>

      <ComputeGate capacity={COMPUTE_GATE_CAPACITY}>
        <div class={ui.body}>
          {/* ── Status bar ──────────────────────────────────────────────── */}
          <Show when={!isIdle()}>
            <div class={ui.statusBar}>
              <span class={ui.statusLabel}>
                Gen {currentGen() + 1} of {generations()}
                <Show when={bestEver()}>
                  {' '}
                  · Best {bestEver()!.score.toFixed(3)}
                </Show>
              </span>
              <div class={ui.progressBar}>
                <div
                  class={ui.progressFill}
                  style={{ width: `${progressPct()}%` }}
                />
              </div>
              <span>{formatElapsed(elapsed())}</span>
            </div>
          </Show>

          {/* ── Controls ────────────────────────────────────────────────── */}
          <div class={ui.controlsGrid}>
            {/* ── Population params ── */}
            <div class={ui.controlSection}>
              <div class={ui.sectionHeader}>Population</div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>
                  Size <span class={ui.controlValue}>{populationSize()}</span>
                </div>
                <input
                  type="range"
                  min={MIN_POPULATION}
                  max={MAX_POPULATION}
                  step={POP_STEP}
                  value={populationSize()}
                  onInput={(e) =>
                    setPopulationSize(parseInt(e.currentTarget.value))
                  }
                  disabled={isRunning() || isPaused()}
                />
              </div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>
                  Generations{' '}
                  <span class={ui.controlValue}>{generations()}</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={MAX_GENERATIONS}
                  step={1}
                  value={generations()}
                  onInput={(e) =>
                    setGenerations(parseInt(e.currentTarget.value))
                  }
                  disabled={isRunning() || isPaused()}
                />
              </div>
            </div>

            {/* ── Breeding params ── */}
            <div class={ui.controlSection}>
              <div class={ui.sectionHeader}>Breeding</div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>Selection</div>
                <div class={ui.modeChips}>
                  <button
                    class={
                      selectionStrategy() === 'truncation'
                        ? `${ui.chip} ${ui.chipActive}`
                        : ui.chip
                    }
                    onClick={() => setSelectionStrategy('truncation')}
                    disabled={isRunning() || isPaused()}
                  >
                    Truncation
                  </button>
                  <button
                    class={
                      selectionStrategy() === 'tournament'
                        ? `${ui.chip} ${ui.chipActive}`
                        : ui.chip
                    }
                    onClick={() => setSelectionStrategy('tournament')}
                    disabled={isRunning() || isPaused()}
                  >
                    Tournament
                  </button>
                  <button
                    class={
                      selectionStrategy() === 'roulette'
                        ? `${ui.chip} ${ui.chipActive}`
                        : ui.chip
                    }
                    onClick={() => setSelectionStrategy('roulette')}
                    disabled={isRunning() || isPaused()}
                  >
                    Roulette
                  </button>
                </div>
              </div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>
                  Pressure{' '}
                  <span class={ui.controlValue}>
                    {Math.round(selectionPressure() * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.6}
                  step={0.05}
                  value={selectionPressure()}
                  onInput={(e) =>
                    setSelectionPressure(parseFloat(e.currentTarget.value))
                  }
                  disabled={isRunning() || isPaused()}
                />
              </div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>Crossover</div>
                <div class={ui.modeChips}>
                  <For each={CROSSOVER_MODES}>
                    {(mode) => (
                      <button
                        class={
                          crossoverMode() === mode
                            ? `${ui.chip} ${ui.chipActive}`
                            : ui.chip
                        }
                        onClick={() => setCrossoverMode(mode)}
                        disabled={isRunning() || isPaused()}
                      >
                        {CROSSOVER_LABELS[mode]}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class={ui.controlGroup}>
                <div class={ui.controlLabel}>
                  Mutation{' '}
                  <span class={ui.controlValue}>
                    {mutationStrength().toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.02}
                  value={mutationStrength()}
                  onInput={(e) =>
                    setMutationStrength(parseFloat(e.currentTarget.value))
                  }
                  disabled={isRunning() || isPaused()}
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div class={ui.actions}>
            <Show when={canStart()}>
              <button class={`${ui.actionBtn} ${ui.startBtn}`} onClick={start}>
                Start
              </button>
            </Show>
            <Show when={canPause()}>
              <button class={`${ui.actionBtn} ${ui.pauseBtn}`} onClick={pause}>
                Pause
              </button>
            </Show>
            <Show when={canResume()}>
              <button class={`${ui.actionBtn} ${ui.startBtn}`} onClick={resume}>
                Resume
              </button>
            </Show>
            <Show when={canStop()}>
              <button class={`${ui.actionBtn} ${ui.stopBtn}`} onClick={stop}>
                Stop
              </button>
            </Show>
          </div>

          {/* ── Idle state ────────────────────────────────────────────────── */}
          <Show when={isIdle()}>
            <div class={ui.emptyState}>
              Configure parameters and press Start to run the population
              simulator. It will breed, score, and evolve {populationSize()}{' '}
              flames across {generations()} generations autonomously.
            </div>
          </Show>

          {/* ── Running indicator (no previews — saves GPU) ────────────────── */}
          <Show when={isRunning()}>
            <div class={ui.runningView}>
              <div class={ui.runningGen}>
                Generation {currentGen() + 1} of {generations()}
              </div>
              <div class={ui.runningBest}>
                Best score:{' '}
                <strong>{bestEver()?.score.toFixed(4) ?? '—'}</strong>
              </div>
              <div class={ui.runningAvg}>
                Current avg:{' '}
                {genResults()[genResults().length - 1]?.avgScore.toFixed(4) ??
                  '—'}
              </div>
              <div class={ui.runningHint}>
                IFS previews are paused during simulation for speed.
                <br />
                Press <strong>Pause</strong> to browse the current generation.
              </div>
            </div>
          </Show>

          {/* ── Live gallery (only when paused — user can browse) ───────────── */}
          <Show when={isPaused()}>
            <div class={ui.galleryLabel}>
              Generation {currentGen() + 1} — Top Flames
            </div>
            <div class={ui.gallery}>
              <For each={topN()}>
                {(sf, idx) => (
                  <button
                    type="button"
                    class={ui.galleryItem}
                    classList={{
                      [ui.galleryItemSelected!]: selectedFlame() === sf.flame,
                    }}
                    aria-pressed={selectedFlame() === sf.flame}
                    aria-label={`Select flame #${idx() + 1}, score ${sf.score.toFixed(3)}`}
                    onClick={() => setSelectedFlame(sf.flame)}
                  >
                    <DelayedShow delayMs={idx() * STAGGER_DELAY_MS}>
                      <VariationPreview
                        flame={sf.flame}
                        version={currentGen()}
                        name={`#${idx() + 1}`}
                        isSelected={selectedFlame() === sf.flame}
                        resolution={resolution()}
                        hardwareTier={tier()}
                      />
                    </DelayedShow>
                    <div class={ui.galleryItemRank}>{idx() + 1}</div>
                    <div class={ui.galleryItemScore}>{sf.score.toFixed(3)}</div>
                  </button>
                )}
              </For>
            </div>
            <Show when={selectedFlame()}>
              {(flame) => (
                <div class={ui.loadBar}>
                  <span class={ui.loadBarHint}>
                    Selected: #
                    {topN().findIndex((s) => s.flame === flame()) + 1}
                  </span>
                  <button
                    class={ui.loadBtn}
                    onClick={() => {
                      applyFlame(flame())
                    }}
                  >
                    Use This Flame
                  </button>
                </div>
              )}
            </Show>
          </Show>

          {/* ── Results ───────────────────────────────────────────────────── */}
          <Show when={isComplete()}>
            <div class={ui.resultsSection}>
              <Show
                when={
                  genResults().length > 0 && genResults().length < generations()
                }
              >
                <div class={ui.stoppedNote}>
                  Stopped early — showing {genResults().length} of{' '}
                  {generations()} generations
                </div>
              </Show>
              <div class={ui.resultsTitle}>Top 3 Best of Run</div>
              <div class={ui.resultsGrid}>
                <For each={topThree()}>
                  {(sf, idx) => (
                    <div>
                      <div class={ui.bestLabel}>
                        #{idx() + 1} — {sf.score.toFixed(3)}
                      </div>
                      <button
                        type="button"
                        class={ui.galleryItem}
                        aria-label={`Use best flame #${idx() + 1}, score ${sf.score.toFixed(3)}`}
                        onClick={() => {
                          applyFlame(sf.flame)
                        }}
                      >
                        <VariationPreview
                          flame={sf.flame}
                          version={0}
                          name={`Best #${idx() + 1}`}
                          isSelected={false}
                          resolution={resolution()}
                          hardwareTier={tier()}
                        />
                      </button>
                    </div>
                  )}
                </For>
              </div>

              <Show when={genResults().length > 0}>
                <div class={ui.resultsTitle} style={{ 'margin-top': '12px' }}>
                  Best of Each Generation
                </div>
                <div class={ui.bestOfGenGrid}>
                  <For each={genResults()}>
                    {(result, i) => (
                      <Show when={i() < visibleGenCount()}>
                        <div>
                          <div class={ui.bestLabel}>
                            Gen {result.generation + 1} —{' '}
                            {result.best.score.toFixed(3)}
                          </div>
                          <button
                            type="button"
                            class={ui.galleryItem}
                            aria-label={`Use best flame of generation ${result.generation + 1}, score ${result.best.score.toFixed(3)}`}
                            onClick={() => {
                              applyFlame(result.best.flame)
                            }}
                          >
                            <DelayedShow
                              delayMs={
                                STAGGER_DELAY_MS * (i() % INITIAL_VISIBLE)
                              }
                            >
                              <VariationPreview
                                flame={result.best.flame}
                                version={result.generation}
                                name={`Gen ${result.generation + 1}`}
                                isSelected={false}
                                resolution={resolution()}
                                hardwareTier={tier()}
                              />
                            </DelayedShow>
                          </button>
                        </div>
                      </Show>
                    )}
                  </For>
                </div>
                <Show when={genResults().length > INITIAL_VISIBLE}>
                  <button
                    class={ui.showMoreBtn}
                    onClick={() =>
                      setVisibleGenCount((c) =>
                        c >= genResults().length
                          ? INITIAL_VISIBLE
                          : genResults().length,
                      )
                    }
                  >
                    {visibleGenCount() >= genResults().length
                      ? 'Show less'
                      : `Show all ${genResults().length} generations`}
                  </button>
                </Show>
              </Show>

              {/* ── Last generation full population ── */}
              <Show when={livePopulation().length > 0}>
                <div class={ui.resultsTitle} style={{ 'margin-top': '14px' }}>
                  Last Generation — Full Population
                </div>
                <div class={ui.gallery}>
                  <For each={livePopulation()}>
                    {(sf, idx) => (
                      <Show when={idx() < visibleFullPopCount()}>
                        <button
                          type="button"
                          class={ui.galleryItem}
                          aria-label={`Use flame #${idx() + 1}, score ${sf.score.toFixed(3)}`}
                          onClick={() => {
                            applyFlame(sf.flame)
                          }}
                        >
                          <DelayedShow
                            delayMs={
                              STAGGER_DELAY_MS * (idx() % INITIAL_VISIBLE)
                            }
                          >
                            <VariationPreview
                              flame={sf.flame}
                              version={0}
                              name={`#${idx() + 1}`}
                              isSelected={false}
                              resolution={resolution()}
                              hardwareTier={tier()}
                            />
                          </DelayedShow>
                          <div class={ui.galleryItemRank}>{idx() + 1}</div>
                          <div class={ui.galleryItemScore}>
                            {sf.score.toFixed(3)}
                          </div>
                        </button>
                      </Show>
                    )}
                  </For>
                </div>
                <Show when={livePopulation().length > INITIAL_VISIBLE}>
                  <button
                    class={ui.showMoreBtn}
                    onClick={() =>
                      setVisibleFullPopCount((c) =>
                        c >= livePopulation().length
                          ? INITIAL_VISIBLE
                          : livePopulation().length,
                      )
                    }
                  >
                    {visibleFullPopCount() >= livePopulation().length
                      ? 'Show less'
                      : `Show all ${livePopulation().length} flames`}
                  </button>
                </Show>
              </Show>
            </div>
          </Show>
        </div>
      </ComputeGate>
    </div>
  )
}
