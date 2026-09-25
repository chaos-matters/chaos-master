// What counts as a view over the editor, for questions that must wait for the viewer to come back.
import { afterEach, describe, expect, it } from 'vitest'
import { setActiveTab } from '@/lib/activeTab'
import { closeDuelView } from './duel'
import { editorCovered, setArenaShowing } from './editorCover'
import { resetPilot } from './pilot'

afterEach(() => {
  setArenaShowing(false)
  setActiveTab('workspace')
  closeDuelView()
  resetPilot()
})

describe('editorCovered', () => {
  it('is false in the editor with nothing over it', () => {
    expect(editorCovered()).toBe(false)
  })

  it('is true while the Arena is open', () => {
    setArenaShowing(true)
    expect(editorCovered()).toBe(true)
  })

  it('is true on Home and in the Arcade hub', () => {
    setActiveTab('home')
    expect(editorCovered()).toBe(true)
    setActiveTab('arcade', 'cinema')
    expect(editorCovered()).toBe(true)
  })
})
