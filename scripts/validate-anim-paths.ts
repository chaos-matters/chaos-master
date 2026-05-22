/**
 * Validates that all animation definition path indices are correct
 * by cross-referencing with the actual flame descriptor structures.
 */
import { examples } from '../packages/app/src/flame/examples'
import { animationDefs } from '../packages/app/src/flame/examples/animations'

let errors = 0

for (const anim of animationDefs) {
  const flame = examples[anim.exampleId]
  if (!flame) {
    console.error(`✗ ${anim.id}: exampleId "${anim.exampleId}" not found`)
    errors++
    continue
  }

  const tids = Object.keys(flame.transforms).sort()

  for (const track of anim.tracks) {
    const parts = track.parameterPath.split('.')

    // Non-transform paths (camera, exposure, vibrancy, etc.)
    if (parts[0] === 'camera' || parts.length <= 1 || parts[0] === 'transform') {
      continue
    }

    // {tid}.{vid} or {tid}.{vid}.{param}
    // Check that the tid exists in the flame
    const tid = parts[0]!
    if (!tids.includes(tid)) {
      console.error(
        `✗ ${anim.id}: path "${track.parameterPath}" — TID "${tid}" not found in flame. Sorted TIDs: [${tids.join(', ')}]`
      )
      errors++
      continue
    }

    // Check vid if present
    if (parts.length >= 2) {
      const vid = parts[1]!
      const vids = Object.keys(flame.transforms[tid]?.variations ?? {}).sort()
      if (!vids.includes(vid)) {
        console.error(
          `✗ ${anim.id}: path "${track.parameterPath}" — VID "${vid}" not found in transform "${tid}". VIDs: [${vids.join(', ')}]`
        )
        errors++
        continue
      }
    }

    // Check paramName if present (3 parts)
    if (parts.length >= 3) {
      const [, , paramName] = parts
      if (!paramName) {
        console.error(`✗ ${anim.id}: path "${track.parameterPath}" — empty param name`)
        errors++
        continue
      }
    }
  }
}

if (errors === 0) {
  console.log('✓ All animation paths are valid — no errors found')
  process.exit(0)
} else {
  console.error(`\n${errors} error(s) found`)
  process.exit(1)
}
