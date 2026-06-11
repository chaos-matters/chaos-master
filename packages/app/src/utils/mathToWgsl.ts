/**
 * Translate a math-notation expression (LaTeX-like) into a WGSL function body.
 * Returns the WGSL code and any errors encountered.
 */

interface TranslationResult {
  wgsl: string
  errors: string[]
}

type PatternReplacement = (match: string, ...groups: string[]) => string

interface Pattern {
  regex: RegExp
  replace: string | PatternReplacement
  description?: string
}

// Local variables pre-declared from math shorthand.
// These are NOT replaced in the user's code — they remain as local var names.
const MATH_LOCAL_VARS: Record<string, string> = {
  r: 'length(pos)',
  theta: 'atan2(pos.y, pos.x)',
  p_x: 'pos.x',
  p_y: 'pos.y',
  x: 'pos.x',
  y: 'pos.y',
}

const GREEK_MAP: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'epsilon',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  τ: 'tau',
  υ: 'upsilon',
  φ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'omega',
}

// Read-only shorthand: always replaced with the computed value
const MATH_READONLY_VARS: Record<string, string> = {
  w: 'varInfo.weight',
}

const PATTERNS: Pattern[] = [
  // Fractions: \frac{a}{b} → (a) / (b)
  {
    regex:
      /\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
    replace: (_m, num, den) => `((${num}) / (${den}))`,
    description: '\\frac{a}{b} → a / b',
  },
  // Square root: \sqrt{x} → sqrt(x)
  { regex: /\\sqrt\{([^}]+)\}/g, replace: (_m, inner) => `sqrt(${inner})` },
  // Absolute value: |x| or \lvert x \rvert → abs(x)
  { regex: /\|([^|]+)\|/g, replace: (_m, inner) => `abs(${inner})` },
  {
    regex: /\\lvert\s+([^|]+?)\s+\\rvert/g,
    replace: (_m, inner) => `abs(${inner})`,
  },
  // Trig functions
  { regex: /\\arcsinh\s*\{([^}]+)\}/g, replace: (_m, x) => `asinh(${x})` },
  { regex: /\\arccosh\s*\{([^}]+)\}/g, replace: (_m, x) => `acosh(${x})` },
  { regex: /\\arctanh\s*\{([^}]+)\}/g, replace: (_m, x) => `atanh(${x})` },
  { regex: /\\arcsin\s*\{([^}]+)\}/g, replace: (_m, x) => `asin(${x})` },
  { regex: /\\arccos\s*\{([^}]+)\}/g, replace: (_m, x) => `acos(${x})` },
  {
    regex: /\\arctan2\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, y, x) => `atan2(${y}, ${x})`,
  },
  { regex: /\\arctan\s*\{([^}]+)\}/g, replace: (_m, x) => `atan(${x})` },
  { regex: /\\sinh\s*\{([^}]+)\}/g, replace: (_m, x) => `sinh(${x})` },
  { regex: /\\cosh\s*\{([^}]+)\}/g, replace: (_m, x) => `cosh(${x})` },
  { regex: /\\tanh\s*\{([^}]+)\}/g, replace: (_m, x) => `tanh(${x})` },
  { regex: /\\sin\s*\{([^}]+)\}/g, replace: (_m, x) => `sin(${x})` },
  { regex: /\\cos\s*\{([^}]+)\}/g, replace: (_m, x) => `cos(${x})` },
  { regex: /\\tan\s*\{([^}]+)\}/g, replace: (_m, x) => `tan(${x})` },
  // Trig functions with parens: \sin(x) → sin(x)
  { regex: /\\arcsinh\(/g, replace: 'asinh(' },
  { regex: /\\arccosh\(/g, replace: 'acosh(' },
  { regex: /\\arctanh\(/g, replace: 'atanh(' },
  { regex: /\\arcsin\(/g, replace: 'asin(' },
  { regex: /\\arccos\(/g, replace: 'acos(' },
  { regex: /\\arctan2\(/g, replace: 'atan2(' },
  { regex: /\\arctan\(/g, replace: 'atan(' },
  { regex: /\\sinh\(/g, replace: 'sinh(' },
  { regex: /\\cosh\(/g, replace: 'cosh(' },
  { regex: /\\tanh\(/g, replace: 'tanh(' },
  { regex: /\\sin\(/g, replace: 'sin(' },
  { regex: /\\cos\(/g, replace: 'cos(' },
  { regex: /\\tan\(/g, replace: 'tan(' },
  // Other math functions
  { regex: /\\ln\s*\{([^}]+)\}/g, replace: (_m, x) => `log(${x})` },
  { regex: /\\ln\(/g, replace: 'log(' },
  { regex: /\\log\s*\{([^}]+)\}/g, replace: (_m, x) => `log(${x})` },
  { regex: /\\exp\s*\{([^}]+)\}/g, replace: (_m, x) => `exp(${x})` },
  { regex: /\\exp\(/g, replace: 'exp(' },
  { regex: /\\floor\s*\{([^}]+)\}/g, replace: (_m, x) => `floor(${x})` },
  { regex: /\\floor\(/g, replace: 'floor(' },
  { regex: /\\ceil\s*\{([^}]+)\}/g, replace: (_m, x) => `ceil(${x})` },
  { regex: /\\ceil\(/g, replace: 'ceil(' },
  {
    regex: /\\min\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, a, b) => `min(${a}, ${b})`,
  },
  {
    regex: /\\max\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, a, b) => `max(${a}, ${b})`,
  },
  { regex: /\\min\(/g, replace: 'min(' },
  { regex: /\\max\(/g, replace: 'max(' },
  {
    regex: /\\clamp\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, x, lo, hi) => `clamp(${x}, ${lo}, ${hi})`,
  },
  { regex: /\\clamp\(/g, replace: 'clamp(' },
  {
    regex: /\\mix\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, a, b, t) => `mix(${a}, ${b}, ${t})`,
  },
  { regex: /\\mix\(/g, replace: 'mix(' },
  {
    regex: /\\step\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, edge, x) => `step(${edge}, ${x})`,
  },
  { regex: /\\step\(/g, replace: 'step(' },
  {
    regex: /\\smoothstep\s*\{([^}]+)\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, lo, hi, x) => `smoothstep(${lo}, ${hi}, ${x})`,
  },
  { regex: /\\smoothstep\(/g, replace: 'smoothstep(' },
  {
    regex: /\\mod\s*\{([^}]+)\}\s*\{([^}]+)\}/g,
    replace: (_m, a, b) => `mod(${a}, ${b})`,
  },
  { regex: /\\mod\(/g, replace: 'mod(' },
  // Constants
  { regex: /\\pi\b/g, replace: '3.14159265' },
  // Operators
  { regex: /\\cdot\b/g, replace: '*' },
  { regex: /\\times\b/g, replace: '*' },
  { regex: /\\leq\b/g, replace: '<=' },
  { regex: /\\geq\b/g, replace: '>=' },
  { regex: /\\neq\b/g, replace: '!=' },
  // Power: x^2 → x * x (simple integer exponents only)
  {
    regex: /(\w+|\))\^\{?(\d+)\}?/g,
    replace: (_m, base, expStr) => {
      const exp = parseInt(expStr, 10)
      if (exp === 0) return '1.0'
      if (exp === 1) return base
      return Array(exp).fill(`(${base})`).join(' * ')
    },
    description: 'x^n → x * x * ... (n times)',
  },
  // Power: x^{y} → pow(x, y) for variable/non-integer exponents
  {
    regex: /(\w+|\))\^\{([^}]+)\}/g,
    replace: (_m, base, exp) => `pow(${base}, ${exp})`,
    description: 'x^{y} → pow(x, y)',
  },
  // Power: x^y → pow(x, y) for variable/non-integer exponents (catches what remains)
  {
    regex: /(\w+|\))\^(\w+|\([^)]+\))/g,
    replace: (_m, base, exp) => `pow(${base}, ${exp})`,
    description: 'x^y → pow(x, y)',
  },
]

/**
 * Translate math notation to WGSL function body.
 */
export function mathToWgsl(input: string): TranslationResult {
  const errors: string[] = []

  if (!input.trim()) {
    return { wgsl: '', errors }
  }

  // Preprocess: replace Greek Unicode characters with ASCII names
  let processed = input
  for (const [greek, ascii] of Object.entries(GREEK_MAP)) {
    processed = processed.replace(new RegExp(greek, 'g'), ascii)
  }

  // Preprocess: \begin{cases}...\end{cases} → select()
  processed = processed.replace(
    /\\begin\{cases\}\s*([\s\S]*?)\\end\{cases\}/g,
    (_m: string, body: string) => {
      const cases = body
        .split('\\\\')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0)
        .map((line: string) => {
          const parts = line.split('&').map((s) => s.trim())
          return { value: parts[0] ?? '', condition: parts[1] ?? '' }
        })

      if (cases.length === 0) return '0.0'
      if (cases.length === 1) return cases[0]!.value

      // Build nested select chain from last to first
      // select(false_val, true_val, cond)
      // For [a & c1, b & c2, c & c3]: select(select(c, b, c2), a, c1)
      let result = cases[cases.length - 1]!.value
      for (let i = cases.length - 2; i >= 0; i--) {
        result = `select(${result}, ${cases[i]!.value}, ${cases[i]!.condition})`
      }
      return result
    },
  )

  const lines = processed.split('\n')
  const wgslLines: string[] = []
  const declaredVars = new Set<string>()
  const varNameMap = new Map<string, string>() // base name → current WGSL name
  const varCounters = new Map<string, number>() // base name → next shadow counter

  function rewriteVarRefs(expr: string): string {
    let result = expr
    for (const [base, current] of varNameMap) {
      if (base === current) continue
      const re = new RegExp(`\\b${base}\\b`, 'g')
      result = result.replace(re, current)
    }
    return result
  }

  // Detect which local variables are referenced anywhere in the input
  for (const name of Object.keys(MATH_LOCAL_VARS)) {
    const re = name.includes('_')
      ? new RegExp(`(?:^|(?<=\\W))${name}(?=\\W|$)`)
      : new RegExp(`\\b${name}\\b`)
    if (re.test(input)) {
      wgslLines.push(`  let ${name} = ${MATH_LOCAL_VARS[name]};`)
      declaredVars.add(name)
      varNameMap.set(name, name)
      varCounters.set(name, 0)
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (raw === undefined) continue

    let line = raw.trim()
    if (!line) {
      wgslLines.push('')
      continue
    }

    // Apply function/operator patterns
    for (const pattern of PATTERNS) {
      try {
        let prev = ''
        let iterations = 0
        while (prev !== line && iterations < 10) {
          prev = line
          line = line.replace(pattern.regex, pattern.replace as string)
          iterations++
        }
      } catch {
        errors.push(
          `Line ${i + 1}: failed to apply pattern "${pattern.description ?? pattern.regex.source}"`,
        )
      }
    }

    // Strip backslash from remaining LaTeX commands (e.g. \theta → theta)
    line = line.replace(/\\([a-zA-Z]+)/g, '$1')

    // Replace read-only shorthand (w → varInfo.weight)
    for (const [name, wgsl] of Object.entries(MATH_READONLY_VARS)) {
      const re = new RegExp(`\\b${name}\\b`, 'g')
      line = line.replace(re, wgsl)
    }

    // Parse assignment: "lhs = rhs"
    const assignMatch = line.match(/^([a-zA-Z_]\w*)\s*=\s*(.+)$/)
    if (assignMatch) {
      const lhs = assignMatch[1]!
      const rhs = rewriteVarRefs(assignMatch[2]!)

      if (declaredVars.has(lhs)) {
        // Reassignment — shadow with numbered let binding
        const c = (varCounters.get(lhs) ?? 0) + 1
        varCounters.set(lhs, c)
        const newName = `${lhs}_${c}`
        varNameMap.set(lhs, newName)
        declaredVars.add(newName)
        wgslLines.push(`  let ${newName} = ${rhs};`)
      } else {
        // First assignment — use let
        declaredVars.add(lhs)
        varNameMap.set(lhs, lhs)
        varCounters.set(lhs, 0)
        wgslLines.push(`  let ${lhs} = ${rhs};`)
      }
    } else {
      // Expression — treat as return value
      wgslLines.push(`  return ${rewriteVarRefs(line)};`)
    }
  }

  // If no line generated a return statement, emit implicit return.
  const hasReturn = wgslLines.some((l) => l.trimStart().startsWith('return '))
  if (!hasReturn && wgslLines.length > 0) {
    // Determine which base variables were reassigned
    const modified = new Set<string>()
    for (const [base, current] of varNameMap) {
      if (base !== current) modified.add(base)
    }

    // Ensure needed vars are declared for the return expression
    if (modified.has('r') || modified.has('theta')) {
      if (!varNameMap.has('r')) {
        wgslLines.push('  let r = length(pos);')
        varNameMap.set('r', 'r')
      }
      if (!varNameMap.has('theta')) {
        wgslLines.push('  let theta = atan2(pos.y, pos.x);')
        varNameMap.set('theta', 'theta')
      }
      wgslLines.push(
        `  return vec2f(${rewriteVarRefs('r')} * cos(${rewriteVarRefs('theta')}), ${rewriteVarRefs('r')} * sin(${rewriteVarRefs('theta')}));`,
      )
    } else if (
      modified.has('p_x') ||
      modified.has('p_y') ||
      modified.has('x') ||
      modified.has('y')
    ) {
      const retX = modified.has('x') && !modified.has('p_x') ? 'x' : 'p_x'
      const retY = modified.has('y') && !modified.has('p_y') ? 'y' : 'p_y'

      if (!varNameMap.has(retX)) {
        wgslLines.push(`  let ${retX} = pos.x;`)
        varNameMap.set(retX, retX)
      }
      if (!varNameMap.has(retY)) {
        wgslLines.push(`  let ${retY} = pos.y;`)
        varNameMap.set(retY, retY)
      }
      wgslLines.push(
        `  return vec2f(${rewriteVarRefs(retX)}, ${rewriteVarRefs(retY)});`,
      )
    } else {
      wgslLines.push('  return vec2f(pos.x, pos.y);')
    }
  }

  return { wgsl: wgslLines.join('\n'), errors }
}

/**
 * Heuristic to detect if text looks like math notation.
 * Returns true if the input contains LaTeX commands or math-style syntax.
 */
export function isMathNotation(text: string): boolean {
  if (!text.trim()) return false
  // Contains LaTeX commands
  if (/\\[a-zA-Z]+/.test(text)) return true
  // Contains math-specific patterns
  if (/\^/.test(text) && !text.includes('//')) return true
  return false
}
