// Entry point for the creation-steps generator: turns a finished flame into a
// `.steps.json` the app's existing replay loader accepts.
//
// It imports the app's OWN planner (src/recorder/synthesize) and its OWN replay
// path, so what this writes is what the Replay panel plays — no second
// implementation of the commands, and no claim that is not measured here.
// Bundled by esbuild and run in plain node (see synthesize-steps.mjs); no
// browser, no GPU.
//
// stdin: JSON options. stdout: JSON `{ results: [...] }`.
import { readFileSync } from 'node:fs'
import { reportPlan } from '@/recorder/synthesize/report'
import { isSynthesisStrategy } from '@/recorder/synthesize/strategies'
import { extractFlameFromPng } from '@/utils/flameInPng'

interface Options {
  /** Absolute paths of PNGs (with a FlameJson chunk) or JSON descriptors. */
  inputs: string[]
  strategies: string[]
  seed: number
  colourFirst?: boolean
  maxSteps?: number
  holdMs?: number
  /** Fixed clock, so re-running produces byte-identical files. */
  createdAt?: string
}

interface Result {
  input: string
  strategy: string
  ok: boolean
  snapped: boolean
  steps: number
  residual: string[]
  error?: string
  /** The session, ready to be written next to the flame it rebuilds. */
  session?: unknown
}

async function readFlame(path: string): Promise<unknown> {
  const bytes = readFileSync(path)
  if (path.toLowerCase().endsWith('.json')) {
    return JSON.parse(bytes.toString('utf8'))
  }
  // A copy, not a view: the PNG reader walks chunk offsets through
  // `.buffer`, and node's pooled Buffer would hand it the wrong origin.
  const payload = await extractFlameFromPng(new Uint8Array(bytes))
  return payload.flame
}

async function main(): Promise<void> {
  const raw = readFileSync(0, 'utf8')
  const options = JSON.parse(raw) as Options
  const strategies = options.strategies.filter((entry) =>
    isSynthesisStrategy(entry),
  )
  const results: Result[] = []

  for (const input of options.inputs) {
    let flame: unknown
    try {
      flame = await readFlame(input)
    } catch (error) {
      for (const strategy of strategies) {
        results.push({
          input,
          strategy,
          ok: false,
          snapped: false,
          steps: 0,
          residual: [],
          error: error instanceof Error ? error.message : String(error),
        })
      }
      continue
    }
    for (const strategy of strategies) {
      const report = reportPlan(flame, {
        strategy,
        seed: options.seed,
        ...(options.colourFirst === undefined
          ? {}
          : { colourFirst: options.colourFirst }),
        ...(options.maxSteps === undefined
          ? {}
          : { maxSteps: options.maxSteps }),
        ...(options.holdMs === undefined ? {} : { holdMs: options.holdMs }),
        ...(options.createdAt === undefined
          ? {}
          : { createdAt: options.createdAt }),
      })
      // One `error`, decided here. Two spreads each carrying that key would
      // let the later one silently drop the earlier message, and the planner
      // is free to start reporting both at once.
      const failure =
        report.error ??
        (report.mismatched.length === 0
          ? undefined
          : `replay diverged at ${report.mismatched.join(', ')}`)
      results.push({
        input,
        strategy,
        ok: report.ok,
        snapped: report.snapped,
        steps: report.steps,
        residual: [...report.residual],
        ...(failure === undefined ? {} : { error: failure }),
        ...(report.session === undefined ? {} : { session: report.session }),
      })
    }
  }

  process.stdout.write(JSON.stringify({ results }))
}

void main()
