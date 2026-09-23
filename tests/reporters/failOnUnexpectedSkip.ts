import type { FullResult, Reporter, TestCase, TestResult, } from '@playwright/test/reporter'

const CI_PROJECT = 'chromium-ci'

/**
 * Fails the run when a test in the CI project skips. A spec that skips when its
 * selector misses reports green while testing nothing: `documentation.spec.ts`
 * did exactly that for months after its `Docs` button went away. A skip that is
 * a real decision says so with an `intentional-skip` annotation.
 *
 * The `chromium` project is exempt: several of its specs skip on purpose when
 * the software adapter cannot render, which is why they are not in CI.
 */
export default class FailOnUnexpectedSkip implements Reporter {
  private readonly unexpected: string[] = []

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status !== 'skipped') return
    if (test.parent.project()?.name !== CI_PROJECT) return
    const annotations = [...test.annotations, ...result.annotations]
    if (annotations.some((a) => a.type === 'intentional-skip')) return
    this.unexpected.push(test.titlePath().filter(Boolean).join(' > '))
  }

  // Reporter.onEnd may resolve to a status override; its type does not admit
  // a plain object, so the override goes back as a promise.
  onEnd(_result: FullResult): Promise<{ status: 'failed' } | undefined> {
    if (this.unexpected.length === 0) return Promise.resolve(undefined)
    console.error(
      `\n${this.unexpected.length} unexpected skip(s) in ${CI_PROJECT}:\n  ${this.unexpected.join('\n  ')}\n` +
        'Fix the spec, or annotate the skip as intentional-skip with a reason.',
    )
    return Promise.resolve({ status: 'failed' })
  }
}
