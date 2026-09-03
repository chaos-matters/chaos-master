/**
 * Caps applied to every serialized console entry. They exist so one log call
 * can never turn into unbounded work or an unbounded string: a logged value can
 * be a live GPU handle, a flame graph, or the whole DOM.
 */
export const LOG_SERIALIZE_LIMITS = {
  /** Nesting levels expanded before a value collapses to a type tag. */
  depth: 4,
  /** Items printed per array. */
  arrayItems: 50,
  /** Own keys printed per object. */
  objectKeys: 50,
  /** Characters kept per string. */
  stringLength: 500,
  /** Characters kept for a whole entry. */
  totalLength: 4000,
} as const

const TRUNCATION_MARKER = '... (truncated)'

type Context = {
  /** Characters emitted so far, structural ones included. */
  used: number
  /** Set once anything had to be dropped for the budget. */
  truncated: boolean
  /** Objects on the current path, so cycles resolve instead of recursing. */
  seen: Set<object>
}

function charge(ctx: Context, text: string): string {
  ctx.used += text.length
  return text
}

function chargeLength(ctx: Context, count: number) {
  ctx.used += count
}

function overBudget(ctx: Context) {
  return ctx.used >= LOG_SERIALIZE_LIMITS.totalLength
}

function clampString(value: string) {
  if (value.length <= LOG_SERIALIZE_LIMITS.stringLength) {
    return value
  }
  const dropped = value.length - LOG_SERIALIZE_LIMITS.stringLength
  return `${value.slice(0, LOG_SERIALIZE_LIMITS.stringLength)}... (+${dropped} chars)`
}

function constructorName(value: object) {
  try {
    const name = (value as { constructor?: { name?: string } }).constructor
      ?.name
    return typeof name === 'string' && name.length > 0 ? name : 'Object'
  } catch {
    return 'Object'
  }
}

function isDomNode(value: object) {
  return typeof Node !== 'undefined' && value instanceof Node
}

/** Reads one own property without letting a throwing getter escape. */
function readOwn(value: object, key: string) {
  try {
    return { ok: true, value: (value as Record<string, unknown>)[key] }
  } catch {
    return { ok: false, value: undefined }
  }
}

/** Lays items out the way JSON.stringify(value, null, 2) would. */
function wrap(
  prefix: string,
  open: string,
  close: string,
  items: string[],
  depth: number,
  ctx: Context,
) {
  if (items.length === 0) {
    return charge(ctx, `${prefix}${open}${close}`)
  }
  const pad = '  '.repeat(depth + 1)
  const closePad = '  '.repeat(depth)
  // The braces, commas, newlines and indentation are characters the panel has
  // to render too, so they count against the budget.
  chargeLength(
    ctx,
    prefix.length +
      open.length +
      close.length +
      closePad.length +
      items.length * (pad.length + 2),
  )
  return `${prefix}${open}\n${items.map((item) => `${pad}${item}`).join(',\n')}\n${closePad}${close}`
}

function serializeArrayItems(value: unknown[], depth: number, ctx: Context) {
  const items: string[] = []
  const shown = Math.min(value.length, LOG_SERIALIZE_LIMITS.arrayItems)
  for (let i = 0; i < shown; i++) {
    if (overBudget(ctx)) {
      ctx.truncated = true
      items.push('...')
      return items
    }
    items.push(serializeValue(value[i], depth + 1, ctx))
  }
  if (value.length > shown) {
    items.push(charge(ctx, `... ${value.length - shown} more items`))
  }
  return items
}

function serializeObjectEntries(value: object, depth: number, ctx: Context) {
  let keys: string[]
  try {
    // Own enumerable keys only: prototype accessors on a class instance can be
    // expensive or throw, and a detached GPU handle throws on every getter.
    keys = Object.keys(value)
  } catch {
    return []
  }
  const items: string[] = []
  const shown = Math.min(keys.length, LOG_SERIALIZE_LIMITS.objectKeys)
  for (let i = 0; i < shown; i++) {
    if (overBudget(ctx)) {
      ctx.truncated = true
      items.push('...')
      return items
    }
    const key = keys[i]!
    const label = charge(ctx, JSON.stringify(clampString(key)))
    const read = readOwn(value, key)
    const text = read.ok
      ? serializeValue(read.value, depth + 1, ctx)
      : charge(ctx, '[unreadable]')
    items.push(`${label}: ${text}`)
  }
  if (keys.length > shown) {
    items.push(charge(ctx, `... ${keys.length - shown} more keys`))
  }
  return items
}

function serializeObject(value: object, depth: number, ctx: Context): string {
  if (value instanceof Error) {
    return charge(ctx, `[${value.name}: ${value.message}]`)
  }
  if (value instanceof Date) {
    // toISOString throws on an invalid date, and a bad parse is exactly the
    // kind of value someone reaches for the console to look at.
    return charge(
      ctx,
      Number.isNaN(value.getTime())
        ? '[Invalid Date]'
        : JSON.stringify(value.toISOString()),
    )
  }
  if (value instanceof RegExp) {
    return charge(ctx, String(value))
  }
  if (value instanceof Map) {
    return charge(ctx, `[Map(${value.size})]`)
  }
  if (value instanceof Set) {
    return charge(ctx, `[Set(${value.size})]`)
  }
  if (value instanceof Promise) {
    return charge(ctx, '[Promise]')
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView & { length?: number }
    return charge(
      ctx,
      `[${constructorName(value)}(${view.length ?? view.byteLength})]`,
    )
  }
  if (value instanceof ArrayBuffer) {
    return charge(ctx, `[ArrayBuffer(${value.byteLength})]`)
  }
  // Walking a node would drag in its parents, its document and every listener.
  if (isDomNode(value)) {
    return charge(ctx, `[${constructorName(value)}]`)
  }
  if (ctx.seen.has(value)) {
    return charge(ctx, '[Circular]')
  }

  const isArray = Array.isArray(value)
  if (depth >= LOG_SERIALIZE_LIMITS.depth) {
    return charge(ctx, isArray ? '[Array]' : `[${constructorName(value)}]`)
  }

  ctx.seen.add(value)
  try {
    if (isArray) {
      const items = serializeArrayItems(value, depth, ctx)
      return wrap('', '[', ']', items, depth, ctx)
    }
    const name = constructorName(value)
    const items = serializeObjectEntries(value, depth, ctx)
    return wrap(
      name === 'Object' ? '' : `${name} `,
      '{',
      '}',
      items,
      depth,
      ctx,
    )
  } finally {
    ctx.seen.delete(value)
  }
}

function serializeValue(value: unknown, depth: number, ctx: Context): string {
  switch (typeof value) {
    case 'undefined':
      return charge(ctx, 'undefined')
    case 'boolean':
    case 'number':
      return charge(ctx, String(value))
    case 'bigint':
      return charge(ctx, `${value}n`)
    case 'symbol':
      return charge(ctx, value.toString())
    case 'function':
      return charge(ctx, `[Function: ${value.name || 'anonymous'}]`)
    case 'string':
      return charge(ctx, JSON.stringify(clampString(value)))
    case 'object':
      return value === null
        ? charge(ctx, 'null')
        : serializeObject(value, depth, ctx)
    default:
      return charge(ctx, String(value))
  }
}

function serializeArg(value: unknown, ctx: Context) {
  // Top-level strings and errors read better bare, which is how the panel has
  // always printed them.
  if (typeof value === 'string') {
    return charge(ctx, clampString(value))
  }
  if (value instanceof Error) {
    return charge(ctx, `${value.name}: ${value.message}`)
  }
  return serializeValue(value, 0, ctx)
}

/**
 * Turns console arguments into one bounded, display-ready string.
 *
 * The console panel keeps entries until they fall out of its ring buffer, so an
 * entry must not hold the logged value itself: that pins whole object graphs
 * against garbage collection, and a value mutated after the call would silently
 * rewrite what the panel shows. Serializing here takes a snapshot instead and
 * gives up every reference.
 *
 * The shape is what the panel used to print via JSON.stringify(value, null, 2),
 * with the gaps JSON leaves — functions, symbols, bigints, cycles, class
 * instances, DOM and GPU handles — filled in.
 */
export function serializeLogArgs(args: unknown[]): string {
  const ctx: Context = { used: 0, truncated: false, seen: new Set() }
  const parts: string[] = []
  for (const arg of args) {
    if (overBudget(ctx)) {
      ctx.truncated = true
      break
    }
    try {
      parts.push(serializeArg(arg, ctx))
    } catch {
      // Nothing here may throw: this runs inside the patched console methods,
      // so an escaping error would break the caller's own console call. An
      // exotic value (a revoked proxy, a throwing prototype trap) costs its own
      // argument and nothing more.
      parts.push(charge(ctx, '[unserializable]'))
    }
  }

  let text = parts.join(' ')
  if (text.length > LOG_SERIALIZE_LIMITS.totalLength) {
    text = text.slice(0, LOG_SERIALIZE_LIMITS.totalLength)
    ctx.truncated = true
  }
  return ctx.truncated ? `${text}${TRUNCATION_MARKER}` : text
}
