// Validate stored gallery flames against the app's OWN schema.
//
// A bounds check written by hand would only cover the limits someone
// remembered; this runs `validateFlame`, so anything the app would refuse to
// render is reported — including the row's `flame`, its animation-bearing
// twin, and every entry of a curated `sequence`.
//
// stdin: JSON `{ rows: [{ slug, flame, sequence }] }`
// stdout: JSON `{ results: [{ slug, ok, where, message }] }`
import { validateFlame } from '@/flame/schema/flameSchema'

interface Row {
  slug: string
  flame: unknown
  sequence?: unknown
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = []
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c: string) => chunks.push(c))
    process.stdin.on('end', () => {
      resolve(chunks.join(''))
    })
    process.stdin.on('error', reject)
  })
}

function check(
  slug: string,
  where: string,
  flame: unknown,
): { slug: string; ok: boolean; where: string; message: string } {
  try {
    validateFlame(flame)
    return { slug, ok: true, where, message: '' }
  } catch (error) {
    return {
      slug,
      ok: false,
      where,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const { rows } = JSON.parse(await readStdin()) as { rows: Row[] }
  const results = []
  for (const row of rows) {
    results.push(check(row.slug, 'flame', row.flame))
    const seq = row.sequence
    if (Array.isArray(seq)) {
      seq.forEach((entry, i) => {
        results.push(check(row.slug, `sequence[${i}]`, entry))
      })
    }
  }
  process.stdout.write(JSON.stringify({ results }))
}

await main()
