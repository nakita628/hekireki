// Python source for a value: what django and SQLAlchemy write a default, a choice or a JSON
// literal as.

// Python hard keywords cannot be attribute names (`async`/`yield` etc. are a syntax error). Soft
// keywords (match/case/type/_) are valid names and excluded.
export const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

/** A double-quoted Python string literal. */
export function toPythonString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `"${escaped}"`
}

/** A JSON value as a Python literal: `None`, `True`, a list, a dict. */
export function jsonToPythonLiteral(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return toPythonString(value)
  if (Array.isArray(value)) return `[${value.map(jsonToPythonLiteral).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([k, v]) => `${toPythonString(k)}: ${jsonToPythonLiteral(v)}`)
      .join(', ')}}`
  }
  return 'None'
}

/**
 * The prose of a `///` comment as a Python docstring at `indent`: no lines when there is none, a
 * one-line `"""text"""` for a single line, and otherwise a closing `"""` on its own line. A
 * backslash, and a quote that another quote or the end follows, are escaped so the text can
 * neither close the docstring early nor read as an escape sequence.
 *
 * @param text - the prose, as `stripAnnotations` returns it
 * @param indent - the indentation of the docstring
 * @returns the lines of the docstring
 */
export function pythonDocstringLines(text: string | undefined, indent: string) {
  if (text === undefined) return []
  const escaped = text.replaceAll('\\', '\\\\').replaceAll(/"(?="|$)/gu, '\\"')
  const [first, ...rest] = escaped.split('\n')
  if (rest.length === 0) return [`${indent}"""${escaped}"""`]
  return [
    `${indent}"""${first}`,
    ...rest.map((line) => (line === '' ? '' : `${indent}${line}`)),
    `${indent}"""`,
  ]
}
