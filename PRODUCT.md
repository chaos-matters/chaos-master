# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Lumen Apeiron serves artists and explorers creating iterated-function-system
flames in the browser. Its advanced tools also serve renderer developers and
variation authors who need to inspect, compare, and optimize WebGPU rendering
paths without leaving the application.

## Product Purpose

Lumen Apeiron is a real-time WebGPU flame generator and editor. It makes
fractal-flame creation, exploration, animation, import, export, and safe custom
variation authoring available as a browser-native workflow. Success means users
can move fluidly between visual experimentation and technically reproducible
rendering work.

## Positioning

The product combines an artist-facing flame editor with a TypeGPU-based renderer,
metadata-rich portable flame files, and an in-application laboratory for
reproducible renderer and variation comparisons. The benchmark laboratory must
measure the actual flame pipeline rather than an unrelated synthetic graphics
score.

## Operating Context

Users work with live WebGPU canvases, flame descriptors, palettes, transforms,
variation math and code, local flame history, built-in examples, imported
`.flame`/XML files, and PNG files containing embedded flame state. Benchmark
work is performed against the local browser and GPU first; a separately
attested server executor is a future extension.

## Capabilities and Constraints

- The current renderer and benchmark modal remain available as a recognizable
  quick-score workflow.
- The benchmark laboratory lives at `/benchmarks` and must not mount the normal
  workspace or unrelated GPU previews during timed samples.
- Benchmark inputs may come from built-ins, recent flames, uploads, galleries,
  deterministic generated flames, or controlled variation workloads.
- Comparisons record immutable flame, environment, renderer, RNG,
  initialization, seed, and implementation metadata.
- Mitchell–Netravali is a reconstruction/splatting profile, not a complete
  renderer algorithm.
- Custom executable variation code is restricted to the existing validated,
  bounded TypeGPU-like dialect; arbitrary JavaScript is not accepted.
- Local execution is supported first. Server-side execution remains explicitly
  unavailable until isolated GPU workers and attested results exist.

## Brand Commitments

The public product name is **Lumen Apeiron**, formerly **Chaos Master**. Existing
flame, attractor, and controlled-chaos language may remain where it helps users
understand the renderer. The interface should feel like a precise creative
instrument, not a generic gaming benchmark or an astronomy-themed dashboard.

## Evidence on Hand

The repository contains the production WebGPU renderer, built-in flame corpus,
recent-flame persistence, import/export formats, variation documentation,
TypeGPU/WGSL source displays, a bounded custom-variation compiler, a quick
benchmark modal, and share-card rendering. Benchmark claims must come from
recorded runs; the product must not fabricate performance data.

## Product Principles

1. Preserve artistic immediacy while exposing technical depth progressively.
2. Make comparisons reproducible before making them impressive.
3. Keep each performance axis explicit so unrelated variables are not conflated.
4. Treat GPU resources as finite and quiesce unrelated rendering while measuring.
5. Present exact data beside every branded visualization.

## Accessibility & Inclusion

Benchmark setup and results must remain operable without pointer-only gestures.
Radial or visual controls require equivalent linear controls, visible focus, and
semantic state. Motion must respect reduced-motion preferences and must stop
during benchmark execution.
