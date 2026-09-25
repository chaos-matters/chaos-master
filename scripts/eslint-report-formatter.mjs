// ESLint formatter for CI's lint step: prints the usual `stylish` report, and
// when ESLINT_JSON_REPORT names a file, also writes the full JSON report there.
//
// The build job's metrics step reads that file (`pnpm metrics:check
// --lint-report=<file>`) to ratchet the eslint_* keys on every pull request
// without paying for a second type-aware ESLint pass, which takes about as
// long as the lint step itself (1m45s on a runner). ESLint takes one
// --format per run, hence a formatter that does both.
//
//   ESLINT_JSON_REPORT=eslint-report.json \
//     pnpm lint --format ./scripts/eslint-report-formatter.mjs

import { ESLint } from 'eslint'
import { writeFileSync } from 'node:fs'

export default async function format(results, context) {
  const target = process.env.ESLINT_JSON_REPORT
  if (target) writeFileSync(target, JSON.stringify(results))
  const stylish = await new ESLint({ cwd: context.cwd }).loadFormatter(
    'stylish',
  )
  return stylish.format(results, context)
}
