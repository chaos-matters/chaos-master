import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { cancelSessionRecording, startSessionRecording, } from '@/recorder/recorder'
import { recorderExportPending, recorderSavePending, recorderVisible, setRecorderExportPending, setRecorderSavePending, setRecorderVisible, } from './recorderUi'

describe('recorder visibility guard', () => {
  beforeEach(() => {
    cancelSessionRecording()
    setRecorderExportPending(false)
    setRecorderSavePending(false)
    setRecorderVisible(true)
  })

  afterEach(() => {
    cancelSessionRecording()
    setRecorderExportPending(false)
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

  it('keeps the recorder visible until a live interface export settles', () => {
    setRecorderExportPending(true)
    expect(recorderExportPending()).toBe(true)

    setRecorderVisible(false)
    expect(recorderVisible()).toBe(true)

    setRecorderExportPending(false)
    setRecorderVisible(false)
    expect(recorderVisible()).toBe(false)
  })
})
