import { render } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import { resolveFocusElement } from '@/recorder/focus'
import { CheckboxEditor } from './CheckboxEditor'

describe('CheckboxEditor replay focus', () => {
  it('exposes the exact variation parameter path on the visible control', () => {
    const path = 't3.v1.enabled'
    const { unmount } = render(() => (
      <CheckboxEditor
        name="Enabled"
        value={1}
        setValue={() => {}}
        dataParameterPath={path}
      />
    ))
    const control = document.querySelector<HTMLElement>(
      `[data-parameter-path="${path}"]`,
    )
    expect(control).not.toBeNull()
    vi.spyOn(control!, 'getBoundingClientRect').mockReturnValue({
      width: 72,
      height: 18,
    } as DOMRect)

    expect(resolveFocusElement(`param:${path}`)).toBe(control)
    unmount()
  })
})
