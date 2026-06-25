# Local Security & DevSecOps Toolchain

A local-only checklist for generating security telemetry before a manual audit. Nothing
here runs in CI — it is a developer-driven workflow. Scanner output goes to
`.audit_telemetry/` (gitignored).

This repo is a **pnpm** monorepo (`packages/app` = SolidJS + WebGPU client +
Cloudflare Worker; `packages/landing` = Astro). The only server-side surface is the
Worker (`packages/app/src/worker/index.ts`). There is no database, auth, sessions, or
payments, so the toolchain focuses on: worker API hardening, CSP, client-side injection,
secret hygiene, and code-quality/ReDoS smells.

> The upstream "audit-instructions" assume `npm` + `plugin:security/recommended` (legacy
> eslintrc). This repo uses **pnpm** and **ESLint 9 flat config**, so the commands below
> are the adapted equivalents.

## 1. Code-level checkers (ESLint security plugin)

Installed as a root devDependency and wired into `eslint.config.js`:

- `eslint-plugin-security` — data-flow / injection sinks (ReDoS, eval, child_process, …)

It is scoped to `packages/app/src/**` (includes the Worker) and runs at **`warn`** so it
surfaces findings without breaking `pnpm check`.

> `eslint-plugin-sonarjs` was evaluated and **not** adopted: it depends on `yaml`, which
> perturbed pnpm's peer resolution and pulled a duplicate `vite` instance that broke `tsc`,
> and on this codebase its hits were almost entirely false positives (WGSL `x != x` NaN
> checks and typed-zero `p - p` idioms). If you re-add it, pin/dedupe `vite` first.

To produce a JSON report:

```bash
pnpm exec eslint packages/app/src --format json -o .audit_telemetry/eslint_results.json
# human-readable summary:
pnpm exec eslint packages/app/src
```

## 2. Static analysis (SAST) — Semgrep

Install once (Python tool):

```bash
pipx install semgrep
```

Run (pulls the `auto` ruleset from the registry — needs network):

```bash
mkdir -p .audit_telemetry
semgrep scan --config=auto --json -o .audit_telemetry/semgrep_results.json packages
```

## 3. Secret scanning — Gitleaks

Install once. NOTE: the Go module path is still the legacy `zricethezav` path even though
the project moved orgs — installing via `github.com/gitleaks/gitleaks/...` fails:

```bash
go install github.com/zricethezav/gitleaks/v8@latest   # -> ~/go/bin/gitleaks
```

Scan git history + working tree (`--redact` keeps secret values out of the report):

```bash
gitleaks detect --source . \
  --report-format json --report-path .audit_telemetry/gitleaks_results.json \
  --redact || true
```

## 4. Dynamic testing (DAST) — Nuclei (best-effort)

Install once (large binary):

```bash
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest   # -> ~/go/bin/nuclei
```

The Worker serves static assets from `dist/`, so build first, then boot `wrangler dev`
(local miniflare emulates KV/R2/rate-limit; Turnstile fail-opens when its secret is
unset). Default port is `8787`.

```bash
pnpm --filter chaos-master build
pnpm --filter chaos-master wr-dev          # serves http://localhost:8787

# in another shell — focused, time-boxed scan (full template set is ~10k templates):
nuclei -target http://localhost:8787 \
  -t http/misconfiguration/ -t http/exposures/ -t http/cves/ \
  -je .audit_telemetry/nuclei_results.json
```

Caveat: a local `wrangler dev` is not production — most API routes 4xx/5xx without real
bindings/secrets, so DAST findings are mostly response-header / misconfiguration signal.

## Gotchas in this environment

- `go` may be shadowed by a shell alias (here `go` → `nvim`). Use the absolute binary
  path `/usr/bin/go` (or `\go`) when installing the Go tools.
- Scanner output (`.audit_telemetry/`) is gitignored — never commit it.
- The formal audit report is kept outside this repo, in the maintainer's private notes.
