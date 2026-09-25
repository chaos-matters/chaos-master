# Documentation panel, help surface and search indexing — EARS requirements

**Version:** 0.9.11 (`packages/app/package.json`) — the version whose shipped behaviour this describes
**Date:** 2026-09-10
**Scope:** The in-app Documentation modal (its launch path, tab lifecycle,
variation catalog, live preview canvases, formula and shader rendering, and
copy-to-clipboard), the Settings/Help modal that sits beside it in the version
menu, and the crawlability contract of every origin the project publishes —
`robots.txt`, `sitemap.xml`, `X-Robots-Tag` and `llms.txt` on the app worker,
the landing site, and the deploy previews. It does **not** cover the Custom
Variation Editor that the API guide documents, the Changelog/About panel or
`DataManagement` reached from inside the Help modal, the Benchmark modal that
shares the same version menu, or the OG/meta-injection route that serves
crawlers a rich link preview — those are separate surfaces.

**Source:**

- `packages/app/src/components/DocumentationModal/DocumentationModal.tsx` — modal shell, three-tab lifecycle, `createShowDocumentation` launcher
- `packages/app/src/components/DocumentationModal/VariationDocsTab.tsx` — catalog search, category grouping, dimension reset, preview `Root`/`ComputeGate` re-provision, tier-scaled resolution
- `packages/app/src/components/DocumentationModal/SelectedVariationPanel.tsx` — detail pane, badges, copy-id, formula/shader sub-tabs, TS→WGSL source ladder
- `packages/app/src/components/DocumentationModal/ParametersOverview.tsx` — parameter table, editor-probe metadata derivation
- `packages/app/src/components/DocumentationModal/CodeBlock.tsx` — code display, language badge, copy button
- `packages/app/src/components/DocumentationModal/MathSvg.tsx` — TeX → inline SVG resource
- `packages/app/src/components/DocumentationModal/ApiGuideTab.tsx`, `IfsGuideTab.tsx` — the two static guide tabs
- `packages/app/src/components/DocumentationModal/DocumentationModal.module.css` — modal dimensions, single-column collapse
- `packages/app/src/utils/mathjax.ts` — lazy MathJax boot, startup timeout, SVG config
- `packages/app/src/flame/variations/docs/{index,types}.ts`, `content*.ts` — the authored doc map and its TeX strings
- `packages/app/src/components/HelpModal/HelpModal.tsx` — settings, shortcuts, tours, GPU/device info, copy
- `packages/app/src/components/WorkspaceModalsHost/lazyModals.ts` — code-split launchers for both modals
- `packages/app/src/components/SoftwareVersion/SoftwareVersion.tsx` — the version menu both modals launch from
- `packages/app/src/components/Modal/Modal.tsx`, `ModalContext.ts`, `ModalTitleBar.tsx` — Portal, dismissal, promise resolution
- `packages/app/src/components/VariationSelector/VariationSelector.tsx` — `VariationPreview` mount/unmount and snapshot policy
- `packages/app/src/worker/index.ts`, `packages/app/src/worker/middleware/reviewHost.ts` — per-origin robots and `X-Robots-Tag`
- `packages/app/public/robots.txt`, `sitemap.xml`, `llms.txt` — the app origin's crawler-facing files
- `packages/landing/src/pages/robots.txt.ts`, `src/layouts/Base.astro`, `public/sitemap.xml`, `public/llms.txt` — the landing origin's
- `packages/app/wrangler.jsonc` (`env.prod` / `env.dev` / `env.preview`), `.github/workflows/deploy.yml`, `.github/workflows/pr-deployment-table.md` — which origins exist and which are publicly linked

**Tests:**

- `packages/app/src/components/DocumentationModal/DocumentationModal.test.tsx` — `CodeBlock` copy round-trip, `SelectedVariationPanel` badges / copy-id / sub-tab switch / missing-formula notice, `ParametersOverview` empty-vs-table, and smoke renders of both guide tabs. `MathSvg` is mocked out, so nothing here touches MathJax.
- `packages/app/src/worker/index.test.ts` (`describe('worker — review host is kept out of search')`) — the four assertions that pin `dev.lumenapeiron.com` to `Disallow: /` with no `Sitemap:`, production's `robots.txt` to the static asset, `X-Robots-Tag` on every review-host response, and its absence on production.
- `packages/app/src/flame/variations/docs/docs.coverage.test.ts` — every documented key is a real variation and every documented param is a real field.
- `packages/app/src/components/SoftwareVersion/SoftwareVersion.test.tsx` — the version menu invokes `showDocs` / `showHelp` and closes on Escape.
- `tests/documentation.spec.ts` — end-to-end: the Docs pill opens the dialog and all three tabs show content. Note it calls `test.skip` when the Docs pill has not mounted (no WebGPU adapter), so it is not a dependable guard in a software-rendering CI lane.
- _Gap:_ `VariationDocsTab.tsx`, `DocumentationModal.tsx`, `MathSvg.tsx`, `utils/mathjax.ts`, `lazyModals.ts` and `HelpModal.tsx` have **no unit test at all**, and `packages/landing` contains **no test files whatsoever** — `robots.txt.ts` and both `llms.txt` files are entirely unguarded. See the Coverage gaps section for the requirement IDs this leaves exposed.

---

## Requirements

### REQ-DS-001 — The documentation panel is code-split and instantiated once

**When** the documentation launcher is first invoked, the app shall dynamically
import the modal chunk, construct the launcher inside the captured owner via
`runWithOwner` so it can read the app's modal context, and memoise the resulting
promise, so that every later invocation reuses the same module and launcher.

_(`lazyModals.ts:37-55` (`createLazyShowDocumentation`); the owner is captured at `:40` (`getOwner`) and re-entered at `:49`
because `createShowDocumentation` calls `useRequestModal` during construction —
`DocumentationModal.tsx:98` (`requestModal`). `createLazyShowHelp` at `lazyModals.ts:57-101`
follows the same shape.)_

### REQ-DS-002 — A failed panel chunk load is recoverable

**If** the dynamic import of the documentation or help chunk rejects — a stale
hashed chunk after a redeploy, or a dropped connection — **then** the launcher
shall clear its memoised promise and surface the failure to the user, so that a
subsequent click retries the import instead of silently doing nothing.

> **Known deviation:** `packages/app/src/components/WorkspaceModalsHost/lazyModals.ts:45-51` (`showDocumentation`)
> (and `:75-97` (`showHelp`) for Help) — there is no `.catch` and no reset of
> `instancePromise`, so the rejected promise is cached for the life of the page
> and every later click resolves to the same rejection. The call sites discard
> it: `packages/app/src/MainWorkspace.tsx:4492` is `void showDocumentation()`
> and `:4495` is `void showHelp()`, neither wrapped. The button appears inert
> and only a full reload recovers. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

### REQ-DS-003 — Both panels launch from the version menu, which closes first

**When** the "Documentation" or "Settings and More" item in the version menu is
activated, the menu shall close before the launcher is invoked, so the expanded
menu is never left behind the dialog.

_(`SoftwareVersion.tsx:154-168` (`docsPill`) and `:170-186` (`aboutPill`) — each handler calls
`setOpen(false)` before `props.showDocs()` / `props.showHelp()`.)_

### REQ-DS-004 — The panel opens on Variations with tablist semantics

**When** the documentation modal mounts, it shall select the `variations` tab,
render the three tabs (`Variations`, `IFS Mathematics`, `WebGPU & API`) inside a
`role="tablist"` container, and mark exactly one `role="tab"` button
`aria-selected="true"`.

_(`DocumentationModal.tsx:20-24` (`TABS`) for the tab table, `:32` (`DocTab`) for the initial
signal, `:54` (`tablist`) for the tablist, `:59-64` (`tab`) for the per-tab button. No
`role="tabpanel"` or `aria-controls` is emitted.)_

### REQ-DS-005 — Only the active tab's subtree is mounted

**While** a tab is inactive, its subtree shall not be present in the DOM, so
that leaving the Variations tab tears down every live preview canvas rather than
hiding it.

_(`DocumentationModal.tsx:76-86` (`tabBody`) — three sibling `<Show>` blocks keyed on
`tab()`, not a CSS visibility toggle. This is what makes REQ-DS-017's teardown
fire on a tab switch as well as on close.)_

### REQ-DS-006 — Dismissal resolves the request and destroys the subtree

**When** the title-bar close button is pressed or the dialog is cancelled with
Escape, the modal shall resolve the `requestModal` promise and remove its
instance from the modal list, destroying the whole content subtree.

_(`Modal.tsx:101-110` — `respond` resolves then filters the instance out, wrapped
in lib/viewTransition's `startViewTransition`: a view transition where the browser
has one and is not Apple WebKit, at once otherwise; `Modal.tsx:133-136`
(`onCancel`) maps the dialog's
`cancel` event onto `respond(undefined)`;
`DocumentationModal.tsx:36` (`ModalTitleBar`) wires the title bar's `onClose` to `respond`. No
backdrop-click dismissal is implemented.)_

### REQ-DS-007 — Catalog search is fuzzy and score-ordered

**When** the catalog search box holds a non-empty query, the gallery shall score
every variation name in the active registry — 100 for a prefix match, 80 for a
substring match, otherwise a subsequence score penalised by match position — and
shall list only non-negative scores, in descending score order.

_(`VariationDocsTab.tsx:19-36` for `fuzzyScore`, `:73-81` for `filtered`. An
empty query short-circuits to registry order at `:75` (`allTypes`).)_

### REQ-DS-008 — An empty result set explains itself

**If** the query matches no variation, **then** the gallery shall render a
notice card naming the query rather than an empty pane.

_(`VariationDocsTab.tsx:217-232` — the `Show` fallback quotes `query()` back to
the user.)_

### REQ-DS-009 — Category filters appear only when they discriminate

**Where** the current result set spans more than one category, the gallery shall
render an "All" pill plus one pill per present category, in canonical
`CATEGORIES` order; clicking the already-active category pill shall clear the
filter rather than re-apply it.

_(`VariationDocsTab.tsx:182` (`activeCategories`) gates the row on `activeCategories().length > 1`,
`:102-109` derives the present categories, `:200-202` (`setCategoryFilter`) is the toggle-off
behaviour.)_

### REQ-DS-010 — Results are grouped into counted category sections

The gallery shall group the filtered set by category, order the groups by
`sortByCategory`, and head each group with its label and the number of
variations it contains.

_(`VariationDocsTab.tsx:83-100` (`grouped`) for the grouping and sort, `:238-244` (`sectionHeader`) for the
section header and count badge. Variations whose `categoryOf` is undefined are
dropped at `:88` (`cat`).)_

### REQ-DS-011 — Flipping dimension resets selection and filter

**When** the 2D/3D toggle changes the active dimension, the panel shall select
the first _documented_ variation in the new registry — falling back to that
registry's default linear type when none is documented — and shall clear the
category filter.

_(`VariationDocsTab.tsx:63-68` (`createEffect`). Without the reset the detail pane would hold a
type that does not exist in the new registry.)_

### REQ-DS-012 — Documented variations are marked in the grid

**Where** a variation has an authored entry in the doc map, its gallery tile
shall carry a "Documented formula" dot.

_(`VariationDocsTab.tsx:275-280` (`hasDoc`), keyed on `hasDoc` from
`flame/variations/docs/index.ts:31-33` (`hasDoc`).)_

### REQ-DS-013 — Preview canvases get their own GPU context inside the Portal

The catalog gallery shall wrap its previews in a fresh `<Root>` and a
`<ComputeGate>`, because the modal is rendered through a `Portal` and therefore
cannot see the application's own `RootContext` or compute gate.

_(`VariationDocsTab.tsx:212-215` (`Root`) and `:234` (`ComputeGate`); the Portal is `Modal.tsx:82` (`Portal`).
Omitting either provider is the failure mode recorded for WebGPU previews in
modals — see the `LoadFlameModal` / `RandomizerGalleryModal` precedent.)_

### REQ-DS-014 — Concurrent live previews are capped

**While** the catalog is open, no more than `COMPUTE_GATE_CAPACITY` previews
shall be granted GPU work at once, regardless of how many tiles the filter
produced.

_(`VariationDocsTab.tsx:234` (`ComputeGate`); the capacity is `2` by default —
`packages/app/src/defaults.ts:131-133` (`COMPUTE_GATE_CAPACITY`), overridable by
`VITE_COMPUTE_GATE_CAPACITY`.)_

### REQ-DS-015 — Tile reveal is staggered over a bounded index

**When** the gallery renders, each tile shall be revealed after
`25 ms × its 0-based index within the current filtered set`, where that index is
recomputed for every change of filter so the stagger stays bounded rather than
growing with the full registry size.

_(`VariationDocsTab.tsx:112-122` (`galleryIndexOf`) builds the index map over `grouped()`, `:249` (`galleryIndexOf`)
reads it, `:261` applies `DelayedShow delayMs={idx * 25}`;
`DelayedShow` clears its timer on cleanup —
`components/DelayedShow/DelayedShow.tsx`.)_

### REQ-DS-016 — Preview fidelity follows the active hardware tier

The catalog shall render each preview at the resolution mapped to the session's
hardware tier — 192×132 (low), 256×176 (mid), 320×220 (high), 384×264 (ultra) —
and shall pass that same tier through as the preview's target quality.

_(`VariationDocsTab.tsx:40-48` (`PREVIEW_RESOLUTION_BY_TIER`) for the table, `:128-133` (`previewTier`) for the memos, `:268-269` (`hardwareTier`)
for the props. **If** no tier has been detected, **then** `high` is assumed
(`:129` (`hardwareTier`)). The earlier hard cap of `mid` / 160×110 was removed deliberately in
`220f836f`; an audit claim that this makes ~148 tiles allocate at once was
examined and **refuted** — see REQ-DS-017.)_

### REQ-DS-017 — A preview releases its canvas as soon as it has a picture

**When** a preview reaches its target quality, it shall snapshot the canvas to a
static image, swap the image in, and unmount the WebGPU canvas; **while** a tile
is off-screen or the gallery is mid-scroll, it shall not mount a canvas at all.

_(`VariationSelector.tsx:202` for `settledVisible`, `:257-264` (`isPreviewMounted`) for the mount
memo — `!paused && image() === undefined && (allowed() || settledVisible() ||
renderStatus() === 'done')` — and `:266-300` for the snapshot and object-URL
cleanup. The deliberate absence of an `everVisible` latch is what bounds VRAM;
the comment at `:251-256` (`buffers`) records the measured 49-live-canvas regression that
motivated it.)_

### REQ-DS-018 — The detail pane states what the variation is

**When** a variation is selected, the detail pane shall show its normalized
name, its raw type identifier as a copy button, its category (where one is
assigned), its dimension, and its parameter count with correct singular/plural
wording.

_(`SelectedVariationPanel.tsx:56-88` (`detailHeader`); the parameter count comes from
`paramDefaults` at `:35-36`.)_

### REQ-DS-019 — Undocumented prose degrades to a notice, not a blank

**If** the selected variation has no authored `summary`, **then** the summary
card shall render an informational notice saying documentation is in progress.

_(`SelectedVariationPanel.tsx:90-104` (`summaryCard`).)_

### REQ-DS-020 — Undocumented maths points at the shader instead

**If** the selected variation has no authored `tex`, **then** the Formula
sub-tab shall render a notice card that names the omission and directs the
reader to the Shader Code sub-tab, which always has a source.

_(`SelectedVariationPanel.tsx:126-145` (`math`).)_

### REQ-DS-021 — TeX is authored so exactly one backslash reaches MathJax

A `tex` field authored in a TypeScript string literal shall double every
backslash intended to reach MathJax — `'\\sqrt{r}'` in source renders `\sqrt{r}`
— and shall reserve the quadrupled form `\\\\` for a genuine row separator
inside a `cases` / `array` / `matrix` environment; a `tex` passed as a JSX
attribute literal shall use single backslashes, because JSX attribute strings
are not escape-processed.

_(All 229 authored entries across
`flame/variations/docs/content{,.simple,.general,.general2,.rest,.3d}.ts` follow
the doubled form — e.g. `content.ts:20` (`right`). Every quadrupled occurrence in the repo
sits inside `\begin{cases}` — `content.ts:55`, `content.general.ts:141`,
`content.general2.ts:1304`, `content.3d.ts:332`. The JSX form is
`IfsGuideTab.tsx:37`, `:52` (`formulaBlock`), `:67` (`MathSvg`). Doubling again outside `cases` renders a
spurious line break; a stray single backslash in a TS literal is consumed by the
compiler and the macro vanishes. Validate a new entry by rendering it through
`renderTexToSvg`.)_

### REQ-DS-022 — The doc map only describes things that exist

Every key in the variation doc map shall name a real variation type, and every
key under a doc's `params` shall name a real field of that variation's
`paramDefaults`.

_(`flame/variations/docs/index.ts:18-25` (`variationDocsContent`) merges the six content modules;
`docs.coverage.test.ts` asserts both halves. Coverage is intentionally sparse —
`flame/variations/docs/types.ts:41-48` (`documentation`) — with the modal falling back to REQ-DS-019/REQ-DS-020.)_

### REQ-DS-023 — MathJax loads once, lazily, per page

**When** the first formula is rendered, the app shall dynamically import MathJax,
memoise the readiness promise for the rest of the page's life, and render the TeX
in display mode; **while** that promise is pending the formula slot shall show a
"Rendering…" placeholder rather than collapsing.

_(`utils/mathjax.ts:17-21` (`mathjaxReady`) for the memo, `:53` (`mathjaxReady`) for the import, `:94` (`wrapped`) for the
`\displaystyle{…}` wrap; `MathSvg.tsx:14-20` (`createResource`) for the resource and `:23` (`Rendering`) for the
placeholder.)_

### REQ-DS-024 — A MathJax boot that never completes is not a hang

**If** MathJax's startup neither calls `ready()` nor settles `startup.promise`
within 10 seconds, **then** `ensureMathJax` shall reject with a
`MathJax failed to start within 10s` error, so the caller fails visibly instead
of leaving every formula pending forever.

_(`utils/mathjax.ts:59-79` (`timeoutId`) — the timeout is cleared on both the resolve and the
reject path. `renderTexToSvg` separately returns `null` rather than throwing
when the document is missing or `tex2svg` throws — `:92`, `:98-99`.)_

### REQ-DS-025 — Rendered formulas are self-contained and silent

The app shall configure MathJax with `svg.fontCache: 'none'` and an emptied
`attachSpeech` render action, so that each emitted SVG inlines its own glyph
paths — surviving being concatenated into another element's `innerHTML` — and so
that MathJax's speech Web Worker, whose path does not resolve under the bundler,
is never spawned.

_(`utils/mathjax.ts:41` (`fontCache`) and `:50` (`renderActions`), with the reasoning at `:22-52` (`enableSpeech`). The
document-level `enableSpeech` / `enableBraille` flags at `:45-47` (`enableSpeech`) do **not** gate
the worker; clearing the render action is what does.)_

### REQ-DS-026 — Shader source always resolves to something

**When** the Shader Code sub-tab is shown, the panel shall offer TypeGPU (TS) and
WGSL views; **if** no standalone TypeScript source exists for the variation — the
case for the inline-defined 3D registry — **then** it shall say so and display
the resolved WGSL instead, and only **if** neither resolves shall it report the
source unavailable.

_(`SelectedVariationPanel.tsx:179-204` (`lang`) for the TS ladder and its loading state,
`:205-212` (`lang`) for the WGSL view; sources come from `utils/variationSource.ts` via
`SelectedVariationPanel.tsx:50-52` (`typeId`), where the accessor is annotated `(): string` on purpose to keep the
resource generic off the ~600-member variation union.)_

### REQ-DS-027 — Parameter metadata is derived from the real editor

The parameters table shall list every field of the variation's `paramDefaults`,
deriving each one's value type and range by rendering the variation's own editor
in a hidden capture mode; an authored `valueType` or `range` shall override the
derived value, an angle-shaped field name shall be the last-resort type guess,
and a variation with no fields shall render a "No Configurable Parameters"
notice instead of an empty table.

_(`ParametersOverview.tsx:104-114` (`primitives`) for the hidden probe, `:69-84` (`valueTypeOf`) for the
override precedence, `:24-25` (`ANGLE_NAME`) for the name heuristic, `:87-102` (`fields`) for the empty
notice. Captured metadata is reset on every change of variation — `:61-64` (`createEffect`) — so
a stale probe cannot bleed across selections.)_

### REQ-DS-028 — Copy actions confirm, then revert

**When** the code-block copy button, or the variation-ID badge, is activated, the
component shall write exactly the displayed payload to the clipboard and, on
success, swap its icon and label to the confirmed state for 2000 ms before
reverting.

_(`CodeBlock.tsx:9-16` (`handleCopy`) and `:29-40` (`copied`); `SelectedVariationPanel.tsx:38-45` (`handleCopyId`) and
`:69-74` (`copiedId`). The Help modal's device-info copy uses the same pattern with a 1500 ms
window — `HelpModal.tsx:216-223` (`copyDeviceInfo`).)_

### REQ-DS-029 — A missing clipboard is a no-op, not a crash or a lie

**If** `navigator.clipboard` is unavailable — an insecure context, or a browser
that withholds it — **then** the documentation copy buttons shall do nothing and
shall not enter the "Copied" state.

_(`CodeBlock.tsx:10` and `SelectedVariationPanel.tsx:39` (`clipboard`) both guard on
`globalThis.navigator?.clipboard` before writing, and the confirmation flag is
set only inside the resolved `.then`. Note `HelpModal.tsx:219` (`clipboard`) does **not** carry
this guard — it calls `navigator.clipboard.writeText` unconditionally.)_

### REQ-DS-030 — The help surface reports the device it is actually running on

**When** the Settings/Help modal opens, it shall query the WebGPU adapter and
present device, vendor, architecture, max buffer size and VRAM heaps, and shall
offer the same set plus app version, git SHA, user agent, platform, language,
screen, viewport, WebGPU support, CPU cores and device RAM as one copyable text
block.

_(`HelpModal.tsx:103-120` (`getGPUDeviceInformation`) for the query, `:125-174` for `gatherFullDeviceInfo`,
`:569-638` (`gpuSection`) for the rendered grid. Unchanged in this range — included because it
is the help surface named in scope.)_

### REQ-DS-031 — An empty adapter description falls back to the WebGL renderer

**If** `adapter.info.description` is empty — the Firefox case — **then** both the
rendered device row and the copied text shall fall back to the WebGL renderer
string, and shall print "Not exposed by browser" only when that is empty too.

_(`HelpModal.tsx:114-116` (`renderer`), `:158-161` (`deviceName`), `:578-584` (`deviceName`).)_

### REQ-DS-032 — Hardware re-detection is guarded and reported

**While** a hardware-tier re-detection is in flight, the "Detect Again" control
shall be disabled and labelled "Detecting..."; **when** it settles, the app shall
toast the detected tier, and **if** detection throws, **then** it shall toast the
failure and restore the control.

_(`HelpModal.tsx:201-214` (`detectTierAgain`) and `:459-465` (`pickerModeBtn`) — the `finally` block clears the flag on
both paths.)_

### REQ-DS-033 — The panel collapses to one column on narrow viewports

**Where** the viewport is at most 760 px wide, the documentation layout shall
collapse from the catalog/detail split to a single column, with the catalog
capped at 280 px tall and separated by a bottom border rather than a right one.

_(`DocumentationModal.module.css:1178-1188` (`@media`); the desktop shell is
`min(1220px, 91vw) × min(84vh, 850px)` at `:44-45`, inside a dialog capped at
`min(96vw, 1320px) × min(92vh, 920px)` at `:2-3`.)_

### REQ-DS-034 — The production app origin is fully crawlable

The `lumenapeiron.com` origin shall serve `robots.txt` from static assets with
`Allow: /` and a `Sitemap:` line pointing at its own sitemap, and shall send no
`X-Robots-Tag` header on any response.

_(`worker/index.ts:116-118` (`isReviewHost`) routes every non-review host through
`withSecurityHeaders` alone; `packages/app/public/robots.txt` and
`public/sitemap.xml` are the served files. Guarded by
`worker/index.test.ts` — "leaves production robots.txt to the static assets" and
"never marks production noindex".)_

### REQ-DS-035 — The dev review host is excluded at the HTTP boundary, twice

**While** a request's hostname is `dev.lumenapeiron.com`, the worker shall answer
`GET`/`HEAD` `/robots.txt` with a synthesised `Disallow: /` body carrying no
`Allow:` and no `Sitemap:` line and `Cache-Control: no-store`, and shall set
`X-Robots-Tag: noindex, nofollow` on **every** response from that origin,
including the SPA shell and static assets.

**If** the request is not a `GET`/`HEAD` for `/robots.txt` — an API `POST`, a
redirect, an OG image — **then** it shall be served by the normal handler and
merely wrapped in the noindex header, so exclusion from search does not change
the origin's behaviour as a review deploy.

_(`middleware/reviewHost.ts:14-50` (`REVIEW_HOST`) for the substitute body,
`:53-61` for `withNoIndex`, `worker/index.ts:125-130` (`isRead`) for the two layers — where
`isRead` gates only the robots substitution and
`withNoIndex(withSecurityHeaders(response))` wraps whatever the base handler
returned. Two layers because they stop different things: robots.txt prevents the
crawl, the header de-indexes what a crawler already fetched. A robots meta tag in
the SPA would not work here — the app is JavaScript a crawler may never execute.
Partially guarded by `worker/index.test.ts`: its noindex loop iterates `GET`
paths only, so the non-read branch is unasserted.)_

### REQ-DS-036 — Every non-production app origin is excluded, not just the named one

The exclusion above shall apply to every origin serving the app build that is
not the production origin — the `dev` route, the `preview` deploy, and any
future staging origin — so that a duplicate origin can never hand a crawler
production's sitemap.

<!-- cite-check: pinned a5c2f26f -->

> **Fixed deviation** (#90, `c37f8aae`; this note describes the code at `a5c2f26f`): `packages/app/src/worker/middleware/reviewHost.ts:14-18` —
> `isReviewHost` is exact equality against the single constant
> `'dev.lumenapeiron.com'`, so it fails safe in the wrong direction. `env.preview`
> in `packages/app/wrangler.jsonc:150-188` declares worker name
> `chaos-master-preview` with **no** `routes` block (unlike the prod environment's
> `routes` at `:42` and the dev environment's at `:95`), so it publishes on `*.workers.dev`;
> `.github/workflows/deploy.yml:147-156` deploys it on every `pull_request` and
> `:159-208` posts that URL as a markdown link in a public PR comment built from
> `.github/workflows/pr-deployment-table.md`. `worker/index.ts:113-115`
> short-circuits that host to the plain path, so it serves
> `packages/app/public/robots.txt` verbatim — `Allow: /` plus
> `Sitemap: https://lumenapeiron.com/sitemap.xml` — with no `X-Robots-Tag`. The
> one review origin whose URL is publicly linked is the one left indexable. The
> fix is to invert the predicate against `PRODUCTION_HOST`. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

<!-- cite-check: live -->

### REQ-DS-037 — The landing production origin is fully crawlable

The `about.lumenapeiron.com` origin shall serve `Allow: /` plus a `Sitemap:` line
pointing at its own sitemap, and shall emit no robots meta tag.

_(`packages/landing/src/pages/robots.txt.ts:18-32` (`PRODUCTION`) — the file is an Astro route
rather than a `public/` asset precisely so the two deploys can differ;
`Base.astro:42` (`nofollow`) emits the meta tag only under the review flag.
`packages/landing/public/sitemap.xml` lists the single production URL.)_

### REQ-DS-038 — The landing review deploy is excluded, twice

**Where** the landing is built with `PUBLIC_REVIEW_DEPLOY=true` — the
`build:review` script the dev deploy runs — it shall serve `Disallow: /` with no
`Sitemap:` line and shall emit `<meta name="robots" content="noindex, nofollow">`
in every page head.

_(`robots.txt.ts:16` (`isReviewDeploy`) and `:24-27` (`REVIEW`), `Base.astro:34` (`isReviewDeploy`) and `:42` (`nofollow`),
`packages/landing/package.json` `build:review` / `deploy:dev`. The meta tag is
reliable here — unlike on the app — because the landing is server-rendered HTML.
The review origin is `about.dev.lumenapeiron.com`,
`packages/landing/wrangler.jsonc` `env.dev`.)_

### REQ-DS-039 — Both origins publish a real llms.txt

Each public origin shall serve an `llms.txt` as a genuine static text file
following the llmstxt.org convention, describing what the product is, what it can
make, and — explicitly — what it is not, so that a fetcher which cannot execute
the app still gets ground truth rather than the SPA's HTML fallback.

_(`packages/app/public/llms.txt` and `packages/landing/public/llms.txt`, both
added by `f2b78e42`. Before that, `about.lumenapeiron.com/llms.txt` answered 404
and `lumenapeiron.com/llms.txt` answered 200 with `index.html` — an HTML document
claiming to be the file, which is worse. Both close with a "what it is not"
section covering no diffusion model, no general GPU benchmark, no server-side
rendering, and a bounded custom-variation dialect, plus the brand rule that the
name is Lumen Apeiron and never "formerly Chaos Master".)_

### REQ-DS-040 — llms.txt describes the feature set that actually shipped

The claims in each `llms.txt` shall match the shipped code, since this is the one
artefact published as ground truth for machines and nothing downstream can check
it.

> **Known deviation:** `packages/app/public/llms.txt:46` — "Teach, Cinema and Duel
> are the Arcade modes with tools today" names three modes; six shipped, and the
> three unnamed ones (Beats, Art Director, Arena) landed in PRs #74, #75 and #76,
> all merged _before_ #79 wrote this line.
> `packages/app/src/webmcp/tools/` contains `arcadeBeats.ts`,
> `arcadeDirector.ts`, `openArena.ts`, `arenaStartClash.ts` and the rest
> alongside the three that are named, and
> `packages/app/src/lib/activeTab.ts:13-19` (`ArcadeMode`) lists six modes. An assistant
> fetching the file is told authoritatively that half the Arcade has no agent
> tools. Prefer a formulation that does not enumerate. Tracked in
> [docs/agent/BUGS.md](../agent/BUGS.md).

---

## Coverage gaps

Requirements below have **no assertion anywhere that goes red when they are
violated**. Naming a nearby test file would be a false claim of coverage, so they
are listed instead.

**Entirely untested files.** `VariationDocsTab.tsx`, `DocumentationModal.tsx`,
`MathSvg.tsx`, `utils/mathjax.ts`, `lazyModals.ts` and `HelpModal.tsx` have no
unit test. `packages/landing` has no test files at all — neither `robots.txt.ts`
nor either `llms.txt` is exercised by anything.

| Requirement                        | Why it is unguarded                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REQ-DS-001, REQ-DS-002             | `lazyModals.ts` has no test; the deviation in REQ-DS-002 is the untested path.                                                                                                                                                                                                                               |
| REQ-DS-004, REQ-DS-005, REQ-DS-006 | `tests/documentation.spec.ts` clicks the three tabs but asserts only that content appears — it never asserts `aria-selected`, that the inactive subtree is gone, or anything about dismissal. It also `test.skip`s itself when WebGPU is unavailable.                                                        |
| REQ-DS-007 – REQ-DS-012            | Search scoring, the empty-result notice, the category-pill gating and toggle-off, section counts, the dimension-flip reset and the documented dot are all in `VariationDocsTab.tsx`. Nothing renders it.                                                                                                     |
| REQ-DS-013 – REQ-DS-017            | The `Root` + `ComputeGate` re-provision, the concurrency cap, the 25 ms stagger, the tier→resolution table and the snapshot-then-unmount policy are unasserted. These are the requirements a WebGPU regression would break silently, and the one e2e test that opens the modal skips without a real adapter. |
| REQ-DS-021                         | The TeX escaping rule is a convention held only by review. `docs.coverage.test.ts` checks keys and param names, never that a `tex` string renders.                                                                                                                                                           |
| REQ-DS-023 – REQ-DS-025            | `DocumentationModal.test.tsx:9-13` mocks `MathSvg` outright, so MathJax's lazy boot, its 10 s startup timeout, and the `fontCache` / `attachSpeech` configuration are untouched by any test.                                                                                                                 |
| REQ-DS-026                         | The TS→WGSL fallback ladder is untested; the existing `SelectedVariationPanel` test switches to the Shader Code sub-tab but asserts only that the two toggle labels are present.                                                                                                                             |
| REQ-DS-029                         | Both `DocumentationModal.test.tsx` clipboard tests install a working `navigator.clipboard`; the absent-clipboard branch is never taken.                                                                                                                                                                      |
| REQ-DS-030 – REQ-DS-032            | `HelpModal.tsx` has no test.                                                                                                                                                                                                                                                                                 |
| REQ-DS-033                         | Media-query behaviour; no visual or layout test covers it.                                                                                                                                                                                                                                                   |
| REQ-DS-036                         | No test pins a `*.workers.dev` hostname. The four existing worker tests all pass _with the defect present_ — they assert the named review host and production, and the preview origin is neither.                                                                                                            |
| REQ-DS-037 – REQ-DS-040            | `packages/landing` has no test suite, and nothing compares either `llms.txt` against the code it describes. REQ-DS-040's deviation is exactly the drift this absence permits.                                                                                                                                |

**Covered.** REQ-DS-003 (`SoftwareVersion.test.tsx`), REQ-DS-018 / REQ-DS-020 /
REQ-DS-027 / REQ-DS-028 (`DocumentationModal.test.tsx`), REQ-DS-022
(`docs.coverage.test.ts`), REQ-DS-034 and REQ-DS-035
(`worker/index.test.ts`). REQ-DS-019 is partially covered — the missing-formula
notice is asserted, the missing-summary notice is not.
