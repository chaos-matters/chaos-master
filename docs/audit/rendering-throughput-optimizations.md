# Post-mortem: IFS rendering throughput optimizations

**Date:** 2026-06-15
**Branch:** `feat/perf-investigation`
**Related:** [`docs/plans/rendering_performance_investigation.md`](../plans/rendering_performance_investigation.md) (original analysis), [`docs/audit/mn-stochastic-filter-frozen-canvas-postmortem.md`](./mn-stochastic-filter-frozen-canvas-postmortem.md) (the MN frozen-canvas bug fixed along the way)

## Summary

A sequence of changes raised measured throughput on the reference flame from
**~5 B/s to ~17 B/s** (≈3.4×), fixed a long-standing hot-spot overflow defect,
and made the in-app benchmark measure real throughput. The dominant win came
from a single structural fix to the chaos-game loop; everything else was either
enabling (MN filter) or corrective (overflow clamp, benchmark canvas).

| Commit | Change | Effect |
|--------|--------|--------|
| `8a4a651` | Mitchell-Netravali stochastic filter (2D+3D) + frozen-canvas fix + energy-preserving weight | Enabling work; per-frame latency, not throughput |
| `d8a6719` | **Plot every chain iteration after warmup** | **~3.4× throughput (5→17 B/s)** |
| `0b3b221` | Benchmark small/medium/large flame selector | Tooling — measure different workloads |
| `f5e7e2c` | Per-bucket saturation clamp | Fixes hot-spot atomic overflow defect |
| `2303800` | Benchmark canvas 256² → 1024² | Stops saturation from inflating reported M/s |

## The dominant win: plot every iteration (`d8a6719`)

### What was wrong

Each GPU thread ran a chaos-game chain: initialize a point, run `skipIters`
(default **20**) warmup iterations to converge onto the attractor, then plot
**one** point and exit. So we paid ~21 iterations of variation math per *plotted*
point and threw away 20 of every 21.

This explained the old "710M/s vs IFSRenderer's ~10B/s" gap noted in the
investigation doc: in raw *iterations/sec* we were already competitive (~14B/s);
we were just discarding 95% of them.

### Verification against the reference

Confirmed against IFSRenderer's actual kernel
(`IFSEngine/Rendering/Shaders/ifs_kernel.comp.shader`): one loop over
`invocation_iters`, a fuse check `if (iteration_depth < settings.warmup)
continue;`, and `accumulate_hit` on **every** post-warmup iteration. That is the
canonical fractal-flame chaos game (Draves) — warm up once, then plot every
iteration.

### The fix

Restructured all three accumulation shaders (2D blend, 2D non-blend, 3D): warm
up once, then loop `PLOTS_PER_CHAIN` times — each iteration advances the chain
and splats a point. Details:

- The final transform is applied to a **temp** per plot so it doesn't feed back
  into the chain state.
- Bounds rejection became a guarded `if (!oob)` (skip the splat) instead of an
  early `return`, so the loop continues.
- RNG state is saved once after the loop.
- `PLOTS_PER_CHAIN` is **baked as a compile-time loop bound** (lets the shader
  compiler unroll it) and is env-tunable via `VITE_PLOTS_PER_CHAIN` (default 16).
- Point-count accounting (`accumulatedPointCount_`, the B/s window) multiplies by
  `PLOTS_PER_CHAIN`.

Amortization goes from `1/(1+20)` to `16/(16+20)` ≈ a 9× reduction in wasted
iterations; the realized ~3.4× is the throughput share bounded by atomic
traffic and the rest of the per-plot cost. Larger `PLOTS_PER_CHAIN` amortizes
more but raises atomic contention and per-dispatch latency.

## Corrective: hot-bucket overflow clamp (`f5e7e2c`)

Plotting every iteration filled hot buckets far faster, exposing a latent
defect: a bucket taking enough hits overflows its `u32` count (or `i32`
color/`z`) atomic and **wraps around**, showing as a dark/garbage pixel in the
brightest region. The global `safeQualityCap` only guarded this by assuming a
fixed 25× concentration and is bypassed entirely by `disableQualityLimit`.

Fix: gate every splat on a per-bucket saturation threshold
(`BUCKET_SATURATION_COUNT = 2^29` fixed units ≈ 540k points/pixel) via a racy-but-
safe `atomicLoad`. Past the threshold the bucket stops accumulating, so the
atomics can't wrap; cold buckets keep refining. Normal quality-limited renders
never reach it — hot pixels top out in the tens of thousands — so it only
engages on genuine runaways and the unbounded benchmark.

## Corrective: benchmark canvas 256² → 1024² (`2303800`)

The benchmark runs an unbounded 10s render. At 256² it accumulated ~2.6M
points/pixel average — well past the saturation cap — so most buckets stopped
taking atomic adds partway through, and skipping those (expensive, contended)
atomics **inflated** the reported M/s. 1024² keeps the average bucket under the
cap (only the extreme hot tail clamps), so the number reflects real sustained
throughput. Benchmark M/s is therefore **not comparable to prior 256² runs**.

## What's verified vs. not

- Static checks (typecheck, WGSL validation, eslint), a production build (which
  runs the `unplugin-typegpu` transpiler over the new shader bodies), and the
  unit suite (147 tests) all pass.
- Visual correctness and the actual B/s numbers were verified **in-app on a real
  GPU** by the maintainer (the agent environment has no GPU). The overflow defect
  is gone and throughput rose 5→17 B/s.

## Next

- **State persistence** (in progress): persist each chain's point state across
  dispatches (IFSRenderer's `state[gid]`) so warmup is paid once per "settle"
  rather than every dispatch. Asymptotically removes the remaining warmup cost.
- **Cheap interim lever:** raising `VITE_PLOTS_PER_CHAIN` (e.g. 32–64) captures
  much of the same warmup amortization with zero added complexity, at the cost of
  more atomic contention / per-dispatch latency.

### Why we did *not* remove the per-point RNG seed round-trip

It looked like an easy bandwidth win, but the persisted RNG state is **load-
bearing**: it's the only thing that makes successive dispatches of the same
thread plot *different* points. Removing it (seeding purely from
`hash(pointIndex)`) would make every dispatch replay an identical chain — a
sparse, non-converging image. Per-dispatch uniqueness needs either persistence or
a per-dispatch uniform (impossible to vary between dispatches inside one compute
pass). State persistence keeps that uniqueness and uses the RNG state
productively, which is why it supersedes the isolated removal.

## Lessons

- The biggest win was algorithmic (stop discarding 95% of iterations), not
  micro-optimization. Measure *what the metric actually counts* — "points/sec"
  was plotted points, bottlenecked by the warmup-per-plot design, which is why
  the MN post-process change never moved it.
- Faster accumulation surfaced a dormant overflow bug. Throughput changes can
  push existing fixed-point accumulators past limits that were "safe" before.
- The benchmark is a measurement instrument: a correctness fix (saturation) can
  silently distort it, so the instrument needs re-checking after such changes.
