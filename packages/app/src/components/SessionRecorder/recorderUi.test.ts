import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, } from '@/recorder/recorder'
import { recorderSavePending, recorderVisible, setRecorderSavePending, setRecorderVisible, } from './recorderUi'

describe('recorder visibility guard', () => {
  beforeEach(() => {
    cancelSessionRecording()
    setRecorderSavePending(false)
    setRecorderVisible(true)
  })

  afterEach(() => {
    cancelSessionRecording()
    setRecorderSavePending(false)
    setRecorderVisible(true)
  })

  it('keeps the recorder visible until an active recording ends', () => {
    expect(startSessionRecording(examples.example1)).toEqual({ ok: true })

    setRecorderVisible(false)
    expect(recorderVisible()).toBe(true)

    cancelSessionRecording()
    setRecorderVisible(false)
    expect(recorderVisible()).toBe(false)
  })

  it('keeps the recorder visible until a caption save settles', () => {
    setRecorderSavePending(true)
    expect(recorderSavePending()).toBe(true)

    setRecorderVisible(false)
    expect(recorderVisible()).toBe(true)

    setRecorderSavePending(false)
    setRecorderVisible(false)
    expect(recorderVisible()).toBe(false)
  })
})
