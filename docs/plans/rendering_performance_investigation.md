# Rendering Performance Investigation

## Goal

Understand why our IFS renderer achieves ~710M points/second while IFSRenderer (bezo97) claims ~10B points/second on the same GPU, and identify optimization opportunities.

## Pipeline Architecture Comparison

### Our Pipeline (chaos-master-fp)

**5-pass compute shader pipeline per frame:**

| Pass | Workgroup | Dispatch | Purpose |
|------|-----------|----------|---------|
| IFS iteration | 64 threads | 1600 groups (102K threads) | 100K points × 20 iters = 2M point-iterations |
| Histogram binning | 32 threads | ~64 groups | 256-bin density distribution |
| Density estimation | 8×8 threads | ~16K groups | Per-pixel sigma from 3×3 neighborhood |
| Adaptive blur H | 8×8 threads | ~16K groups | Gaussian blur horizontal pass |
| Adaptive blur V | 8×8 threads | ~16K groups | Gaussian blur vertical pass |
| Tonemap | Fullscreen quad | 1 draw call | Color grading + palette |

**Per-frame IFS dispatch**: 1–100 batches of 100K points each, dynamically tuned by GPU timing (14ms budget). At peak: 100 batches × 100K = 10M points × 71 FPS = **710M points/second**.

**Key characteristics:**
- Fixed-point atomic accumulation (×1000 multiplier, u32 atomicAdd)
- Cumulative-sum transform selection (O(n) walk per iteration)
- xoroshiro64++ RNG (64-bit state per thread)
- Jitter-based antialiasing
- 4 full-screen passes after accumulation
- GPU timestamp queries for adaptive workload scaling

### IFSRenderer (bezo97)

**Single compute pass + tonemap post-process:**

- Single compute shader does: iteration → projection → accumulation → filtering
- Workgroup: 64 threads (same)
- Uses `NV_shader_atomic_float` for float atomicAdd on histogram
- Alias method for O(1) transform selection
- xorshift128 + PCG hash RNG (128-bit state)
- Mitchell-Netravali cubic filter sampled during accumulation (single random neighbor per point)
- Separate tonemap post-process pass

## Key Differences

### 1. Multi-Pass vs Single-Pass

Our pipeline runs **5 compute passes** with synchronization barriers between each. Each pass requires:
- Pipeline barrier (flush GPU caches)
- Binding updates
- New dispatch

IFSRenderer does everything in **one compute pass** — iteration, projection, filtering, and accumulation all in a single shader. The only post-processing is a simple tonemap render.

**Impact**: Our 4 extra passes add significant overhead. Each barrier flushes the GPU pipeline. Each pass requires binding table setup. For real-time rendering at 71 FPS, this overhead compounds.

### 2. Adaptive Blur vs Mitchell-Netravali Filter

We run a full two-pass separable Gaussian blur with per-pixel varying sigma (radius up to 36 pixels). This reads 2×73 = 146 neighbor texels per pixel per pass.

IFSRenderer does antialiasing during accumulation: it picks **one random neighbor** within the filter radius and accumulates there with a Mitchell-Netravali weight. This is O(1) per point rather than O(radius²) per pixel.

**Impact**: Our adaptive blur is mathematically superior (proper Gaussian with variable sigma) but extremely expensive. For a 1024×1024 render at radius 12, we read ~24 neighbor pixels per output pixel × 2 passes × 1M pixels = 48M texture reads. IFSRenderer's approach is a stochastic approximation that costs essentially nothing.

### 3. Transform Selection: O(n) Walk vs O(1) Alias Method

Our shader walks transforms sequentially:
```wgsl
let flameIndex = random();
var probabilitySum = 0.0;
for (each transform) {
  probabilitySum += transform.probability;
  if (flameIndex < probabilitySum) { select this; break; }
}
```

IFSRenderer uses the alias method: one random number, one table lookup, O(1).

**Impact**: For flames with 2–6 transforms (typical), the walk is negligible. For complex flames with 50+ transforms, our approach becomes a measurable overhead per point-iteration.

### 4. Float Atomics vs Fixed-Point

IFSRenderer uses `GL_NV_shader_atomic_float` to do `atomicAdd` on float values directly. We use `atomicAdd(u32, value * 1000)` with fixed-point math, then divide by 1000 on readback.

**Impact**: Our approach has marginally more ALU (one multiply, one divide per accumulation) but is universally supported. IFSRenderer's float atomics are NVIDIA-only (NV extension). Not a meaningful throughput difference.

### 5. RNG: xoroshiro64++ vs xorshift128+PCG

We use xoroshiro64++ (two 32-bit state words, 64 bits total). IFSRenderer uses xorshift128 (four 32-bit state words, 128 bits) combined with PCG hash.

**Impact**: Our RNG is adequate but has a shorter period (2^64 vs 2^128). For rendering with millions of RNG calls per frame, the difference in statistical quality is negligible for visual output.

### 6. 2D vs 3D

IFSRenderer iterates points in 3D and projects via perspective/equirectangular/fisheye. We iterate in 2D. 3D adds projection math (matrix multiplication, depth-of-field) per point. This should make IFSRenderer SLOWER, not faster. The fact that it's still faster despite 3D math reinforces the multi-pass overhead theory.

## Why IFSRenderer Is Faster

The dominant factor is the **single-pass accumulation** architecture. By avoiding separate density estimation, histogram binning, and adaptive blur passes, IFSRenderer eliminates:

1. **GPU pipeline barriers** (3–4 per frame)
2. **Full-screen texture reads** (3–4 passes × width × height reads)
3. **Binding table updates** between passes
4. **Command encoding overhead** for multiple dispatches

The Mitchell-Netravali stochastic filter is a strategic trade-off: slightly noisier per-frame output in exchange for dramatically higher throughput. Their approach is to brute-force more points rather than spend GPU time on sophisticated filtering.

## Optimization Opportunities

### High Impact

**1. Merge density estimation into the IFS pass (estimated: 15–25% throughput gain)**
Instead of a separate full-screen pass, compute a coarse density estimate using workgroup shared memory during the IFS pass. Each workgroup tracks how many points landed in its region, then writes a single density value per tile.

**2. Replace adaptive blur with stochastic filter during accumulation (estimated: 30–50% throughput gain)**
Adopt IFSRenderer's approach: during the IFS pass, instead of accumulating at the exact pixel, pick a random neighbor within a radius derived from local density and accumulate there with a Mitchell-Netravali weight. This eliminates BOTH the density estimation AND adaptive blur passes entirely, replacing them with ~2 extra ALU ops per point.

**3. Reduce separate histogram pass (estimated: 5–10% throughput gain)**
Compute the histogram incrementally during the IFS pass using workgroup shared memory, avoiding a separate dispatch.

### Medium Impact

**4. Alias method for transform selection (estimated: 1–5% for typical flames)**
Precompute alias tables on the CPU on transform change, upload as a uniform buffer, and use O(1) selection in the shader. Only meaningful for flames with many transforms.

**5. Increase workgroup occupancy**
Our 102,400 threads for 100,000 points uses ~1 point per thread. Higher-end GPUs can handle much more. Scaling to 1M+ threads would improve GPU utilization, especially on high-end hardware. The dynamic iteration count already handles workload scaling, but within a single dispatch we're under-utilizing the GPU.

**6. Use indirect dispatch with GPU-computed point count**
Instead of CPU-side `ceil(pointCount / 4096)` dispatch calculation, use indirect dispatch where the GPU determines the optimal dispatch size based on prior frame timing.

### Low Impact

**7. Upgrade RNG to xorshift128+**
Longer period, slightly better distribution. Negligible throughput difference.

**8. Reduce atomic contention with multi-bucket hashing**
Distribute points across multiple accumulation buffers (hashed by screen position), then merge in a final pass. Reduces atomic stalls on the same cache line.

## Recommended Path Forward

**Phase 1 (Immediate): Stochastic Filter**
Replace the adaptive blur + density estimation passes with a Mitchell-Netravali stochastic filter applied during IFS accumulation. This is IFSRenderer's approach and should yield the largest single improvement (30–50%). The visual quality trade-off is slightly noisier per-frame output, but with more points/second the noise converges faster.

**Phase 2 (Short-term): Alias Method + Merged Histogram**
Implement alias method for transform selection and compute the histogram incrementally during the IFS pass.

**Phase 3 (Medium-term): Workgroup Scaling + Indirect Dispatch**
Scale workgroup counts based on GPU tier (from the benchmark we already have) and use indirect dispatch for adaptive workload.

## Quick Win: pointsPerBatch Tuning

Our `DEFAULT_POINT_COUNT = 100,000` with the dispatch configuration of `ceil(pointCount / 4096) × 64` Y-groups means we dispatch 1,600 workgroups. A modern GPU can handle 10,000+ workgroups concurrently. Simply increasing the point count per batch (to, say, 500,000 or 1,000,000) would immediately improve GPU utilization without any shader changes — at the cost of slightly higher latency per frame. This is a single-line change worth testing.
