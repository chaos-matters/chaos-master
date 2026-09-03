import { describe, expect, it } from 'vitest'
import { LOG_SERIALIZE_LIMITS, serializeLogArgs } from './serializeLogArgs'

// The console panel used to hold the logged arguments by reference and format
// them at render time. These tests pin the replacement: one bounded string,
// produced at log time, that never walks an unbounded object graph and never
// touches a value that could throw on read.
describe('serializeLogArgs', () => {
  it('joins arguments with a space and leaves top-level strings unquoted', () => {
    expect(serializeLogArgs(['[WebGPU]', 'ready', 42])).toBe(
      '[WebGPU] ready 42',
    )
  })

  it('pretty-prints objects the way the panel used to', () => {
    expect(serializeLogArgs([{ vendor: 'intel', tiers: [1, 2] }])).toBe(
      '{\n  "vendor": "intel",\n  "tiers": [\n    1,\n    2\n  ]\n}',
    )
  })

  it('formats a top-level Error as name and message', () => {
    expect(serializeLogArgs([new TypeError('boom')])).toBe('TypeError: boom')
  })

  it('formats a nested Error in brackets', () => {
    expect(serializeLogArgs([{ cause: new RangeError('bad') }])).toBe(
      '{\n  "cause": [RangeError: bad]\n}',
    )
  })

  it('renders values JSON cannot express', () => {
    expect(
      serializeLogArgs([
        {
          fn: function named() {},
          sym: Symbol('tag'),
          big: 10n,
          missing: undefined,
          nothing: null,
          notANumber: NaN,
        },
      ]),
    ).toBe(
      '{\n' +
        '  "fn": [Function: named],\n' +
        '  "sym": Symbol(tag),\n' +
        '  "big": 10n,\n' +
        '  "missing": undefined,\n' +
        '  "nothing": null,\n' +
        '  "notANumber": NaN\n' +
        '}',
    )
  })

  it('summarises collections, dates and regexps', () => {
    expect(
      serializeLogArgs([
        {
          map: new Map([['a', 1]]),
          set: new Set([1, 2]),
          when: new Date('2020-01-02T03:04:05.000Z'),
          re: /ab+c/gi,
          bytes: new Float32Array(4),
        },
      ]),
    ).toBe(
      '{\n' +
        '  "map": [Map(1)],\n' +
        '  "set": [Set(2)],\n' +
        '  "when": "2020-01-02T03:04:05.000Z",\n' +
        '  "re": /ab+c/gi,\n' +
        '  "bytes": [Float32Array(4)]\n' +
        '}',
    )
  })

  it('labels class instances and keeps their own fields', () => {
    class Handle {
      id = 7
    }
    expect(serializeLogArgs([new Handle()])).toBe('Handle {\n  "id": 7\n}')
  })

  it('does not invoke prototype getters', () => {
    let reads = 0
    class GpuLikeHandle {
      get vendor() {
        reads += 1
        throw new Error('handle detached')
      }
    }
    expect(serializeLogArgs([new GpuLikeHandle()])).toBe('GpuLikeHandle {}')
    expect(reads).toBe(0)
  })

  it('survives an own getter that throws', () => {
    const value = {}
    Object.defineProperty(value, 'broken', {
      enumerable: true,
      get() {
        throw new Error('nope')
      },
    })
    expect(serializeLogArgs([value])).toBe('{\n  "broken": [unreadable]\n}')
  })

  it('reads objects with a null prototype', () => {
    const value = Object.create(null) as Record<string, unknown>
    value.tag = 'bare'
    expect(serializeLogArgs([value])).toBe('{\n  "tag": "bare"\n}')
  })

  it('collapses a DOM node to its type instead of walking the document', () => {
    const el = document.createElement('div')
    document.body.append(el)
    expect(serializeLogArgs([el])).toBe('[HTMLDivElement]')
    el.remove()
  })

  it('marks a cycle instead of recursing forever', () => {
    const value: Record<string, unknown> = { name: 'loop' }
    value.self = value
    expect(serializeLogArgs([value])).toBe(
      '{\n  "name": "loop",\n  "self": [Circular]\n}',
    )
  })

  it('expands a value referenced twice without calling it circular', () => {
    const shared = { n: 1 }
    expect(serializeLogArgs([{ a: shared, b: shared }])).toBe(
      '{\n  "a": {\n    "n": 1\n  },\n  "b": {\n    "n": 1\n  }\n}',
    )
  })

  it('stops descending at the depth limit', () => {
    const deep = { a: { b: { c: { d: { e: 'unreachable' } } } } }
    const text = serializeLogArgs([deep])
    expect(text).toContain('"d": [Object]')
    expect(text).not.toContain('unreachable')
  })

  it('stops descending into deeply nested arrays', () => {
    const text = serializeLogArgs([[[[[['unreachable']]]]]])
    expect(text).toContain('[Array]')
    expect(text).not.toContain('unreachable')
  })

  it('caps the number of array items', () => {
    const items = Array.from({ length: LOG_SERIALIZE_LIMITS.arrayItems + 3 })
    const text = serializeLogArgs([items.map((_, i) => i)])
    expect(text).toContain(`${LOG_SERIALIZE_LIMITS.arrayItems - 1},`)
    expect(text).toContain('... 3 more items')
    expect(text).not.toContain(`${LOG_SERIALIZE_LIMITS.arrayItems + 1}`)
  })

  it('caps the number of object keys', () => {
    const value: Record<string, number> = {}
    for (let i = 0; i < LOG_SERIALIZE_LIMITS.objectKeys + 2; i++) {
      value[`k${i}`] = i
    }
    const text = serializeLogArgs([value])
    expect(text).toContain('... 2 more keys')
    expect(text).not.toContain(`"k${LOG_SERIALIZE_LIMITS.objectKeys + 1}"`)
  })

  it('caps the length of a single string', () => {
    const long = 'a'.repeat(LOG_SERIALIZE_LIMITS.stringLength + 25)
    const text = serializeLogArgs([long])
    expect(text.startsWith('a'.repeat(LOG_SERIALIZE_LIMITS.stringLength))).toBe(
      true,
    )
    expect(text).toContain('... (+25 chars)')
  })

  it('caps the length of the whole entry', () => {
    const wide = Array.from({ length: 40 }, (_, i) => ({
      [`key${i}`]: 'x'.repeat(200),
      nested: { more: 'y'.repeat(200) },
    }))
    const text = serializeLogArgs([wide, wide, wide])
    expect(text.length).toBeLessThanOrEqual(
      LOG_SERIALIZE_LIMITS.totalLength + 32,
    )
    expect(text.endsWith('... (truncated)')).toBe(true)
  })

  it('returns an empty string when nothing was logged', () => {
    expect(serializeLogArgs([])).toBe('')
  })
})
