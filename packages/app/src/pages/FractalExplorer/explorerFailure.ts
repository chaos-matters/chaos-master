/**
 * Why the explorer's picture stopped, for the status readout, and said in
 * the console once per new reason. On a phone the readout is all anyone
 * can see; a desktop console names the same thing.
 *
 * A failed step or orbit can come right with the next reference, which
 * clears it. Shaders the browser would not build never come right: that
 * failure lasts, outranks any other, and `stopped` tells the renderer to
 * try nothing more.
 */

export interface ExplorerFailure {
  /** Why the picture stopped, the lasting reason first, or undefined. */
  readonly message: () => string | undefined
  /** The shaders did not build, so there is nothing left to try. */
  readonly stopped: () => boolean
  /** A failure that the next reference may clear. */
  readonly fail: (cause: unknown) => void
  /** A new reference is in: the failure it replaces is over. */
  readonly clear: () => void
}

const textOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause)

/**
 * `pipelines` resolves to the device's complaint about building the
 * explorer's pipelines, or undefined when they built.
 */
export function createExplorerFailure(
  pipelines: Promise<string | undefined>,
  log: (message: string) => void = (message) => {
    console.error(`[explorer] ${message}`)
  },
): ExplorerFailure {
  let passing: string | undefined
  let lasting: string | undefined

  function say(message: string) {
    if (message !== passing && message !== lasting) log(message)
  }

  function last(complaint: string) {
    const message = `the browser could not build the explorer's shaders: ${complaint}`
    say(message)
    lasting = message
  }

  void pipelines.then(
    (complaint) => {
      if (complaint !== undefined) last(complaint)
    },
    (cause: unknown) => {
      last(textOf(cause))
    },
  )

  return {
    message: () => lasting ?? passing,
    stopped: () => lasting !== undefined,
    fail(cause) {
      const message = textOf(cause)
      say(message)
      passing = message
    },
    clear() {
      passing = undefined
    },
  }
}
