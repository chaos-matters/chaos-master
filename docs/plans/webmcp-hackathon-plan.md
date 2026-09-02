# WebMCP Hackathon & Multi-App Strategy Plan

**Date**: 2026-08-31
**Context**: Research and architecture strategy for the OpenAI WebMCP Challenge and related opportunities.

---

## 1. The WebMCP Challenge — Key Facts

- **Organizer**: OpenAI, co-sponsored by Cloudflare, Vercel, Shopify, Google Chrome, Render, Netlify.
- **Participants**: ~3,960 registrants (~200–600 expected submissions for 10 equal winner slots).
- **Deadline**: September 3, 2026, 1:00pm PDT (22:00 CEST) (~3–5 days remaining).
- **Prizes (Top 10)**:
  - $3,000 cash per winner
  - Codex Micro
  - 1 year ChatGPT Pro
  - $10k Cloudflare credits
  - Vercel / Render credits
  - $500 Netlify cash
  - @OpenAIDevs spotlight
- **Rules on Pre-existing Projects**:
  - Verbatim: _"must have been meaningfully extended using WebMCP after the Submission Period start date… evaluated only on work added during the Submission Period"_ (Period started August 25, 11am PT).
  - All WebMCP commits must land after that date, with explicit documentation distinguishing prior vs new work (commit history + `docs/webmcp.md`).
- **Multiple Submissions**: Allowed if unique and substantially different products.
- **Eligibility & Licensing**:
  - Croatia eligible.
  - AGPL is permitted — author retains IP; sponsor receives only a judging license.
- **Testing & Surfaces**:
  - Tested via live URL in ChatGPT desktop in-app browser (WebMCP support shipped Aug 26) or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` (and "Model Context Tool Inspector" extension).
- **Judging Criteria (Equal Weight)**:
  1. WebMCP leverage
  2. Execution
  3. Potential impact
  4. Creativity / ambition

---

## 2. Critical WebMCP Technical Specifications

- **API Lookup**:
  ```ts
  const modelContext =
    (document as any).modelContext ?? (navigator as any).modelContext
  ```
  _(Note: `document.modelContext.registerTool()` is the current standard; `navigator.modelContext` is deprecated and `provideContext()` was removed from the spec in March 2026)._
- **Tool Signature**:
  ```ts
  interface WebMcpToolDefinition {
    name: string
    description: string
    inputSchema: Record<string, unknown> // JSON Schema
    execute: (
      input: unknown,
      context: { signal?: AbortSignal },
    ) => Promise<unknown> | unknown
    annotations?: {
      readOnlyHint?: boolean
    }
  }
  ```
- **Lifecycle & Teardown**:
  - Registration can accept an `AbortSignal` for automatic cleanup on unmount (ideal for SolidJS `onMount` / `onCleanup`).
- **Budgets & Constraints**:
  - Tool descriptions: $\le 500$ characters.
  - Tool return output: $\le \sim 1.5\text{ KB}$ characters.
  - Use single-purpose action-verb tools with descriptive errors for LLM self-correction.
  - Agent cannot directly "see" the WebGPU canvas; read-only state tools paired with mutation tools keep UI and agent state synchronized.

---

## 3. Fit Analysis: Chaos-Master / Lumen Apeiron

### Pre-Existing Architecture Alignment

1. **Prior Architecture Intent**:
   - `docs/plans/semantic-recorder-plan.md` (Line 39 & 443) explicitly documented that the command log and registry exist so the app can be driven from "tests, an API/MCP server, or a model".
2. **Hardened Command Dispatcher**:
   - `executeReplayCommand` and `preflightReplayCommand` in `packages/app/src/commands/registry.ts` already implement:
     - Argument depth/size budgets (`MAX_REPLAY_ARG_DEPTH = 16`, `MAX_REPLAY_ARG_NODES = 50000`, etc.)
     - Prototype pollution guards (`__proto__`, `constructor`, `prototype`)
     - Schema & type validation per command.
3. **Canonical State & Replay**:
   - `FlameDescriptor` schema is fully validated via Valibot.
   - Replay sessions (`.steps.json`) act as ready-made agent scripts with deterministic execution.
   - `diffFlames` (`packages/app/src/flame/fdiff.ts`) provides structured, actionable comparison metrics ($0\text{--}100\%$ similarity, matched transforms, parameter differences) allowing the model to perform closed-loop iterative refinements.
   - Deterministic seed generation for mutate/breed/randomize.

---

## 4. Proposed Tool Surface (Lumen Apeiron)

### Tier 1 — Core Glue (Fast / Solid Foundation)

- `list_commands`: Discovers available command IDs and schemas.
- `execute_command`: Replay-validated command execution escape-hatch.
- `get_flame`: Returns structured JSON snapshot of the active flame descriptor.
- `set_flame`: Loads a complete flame descriptor (validated via schema).
- `randomize_flame`: Randomizes parameters / transforms with optional seed.
- `mutate_flame`: Applies structured mutation presets with deterministic seed.
- `diff_flames`: Compares current flame with target/baseline descriptor.
- `create_share_link`: Generates compact compressed base64 share URL.
- `load_share_link`: Decodes and applies a compressed share payload.
- `get_undo_state` / `undo` / `redo`: Navigates history stack.
- `record_session`: Starts/stops `.steps.json` recording session.

### Tier 2 — High-Impact Differentiators

- `run_steps`: Replays a sequence of recorded steps in instant or timed mode (with animated visual cursor / spotlight).
- `breed_flames`: Genetic cross-breeding of two flame descriptors with ancestry tracking.
- `add_keyframe` / `get_timeline`: Reads and manipulates animation tracks.
- `create_custom_variation`: Generates dynamic mathematical variations compiled safely via sandboxed WGSL compiler.

---

## 5. Second Potential Entry: Token Circles

- Score: 9/10 fit for local-first privacy.
- Existing remote MCP server with 15 designed schemas (`worker/src/mcp/`).
- WebMCP work: Bind tools to in-browser `localApiRouter.ts`.
- Story: "Financial audit and budgeting without financial data ever leaving the client tab."
- Seeded demo links (`?demo=high|mid|low`) enable immediate zero-setup judge evaluations.

---

## 6. Other Hackathon & Grant Opportunities Scan

1. **Nebius x NVIDIA Global AI Hackathon** (Deadline: Oct 30, 2026) — $50k+ cash; persistent memory track matches Token Circles.
2. **FUTO Micro-grants** (Rolling) — $1k–5k; strong ideological fit for local-first architecture.
3. **Google Chrome Built-in AI Challenge** (Sept 2026) — High fit for on-device Gemini Nano + WebGPU.
4. **AssemblyAI Voice Agent Hackathon** (Sept 1–30, 2026) — $5k cash; fit for MercuryPitch voice coach.
5. **NLnet Grants** (Rolling) — €5k–50k for open source AGPL projects.
6. **Lumen Prize / Prix Ars Electronica** (Jan 2027) — Creative/art competitions suited for existing generative artwork.
