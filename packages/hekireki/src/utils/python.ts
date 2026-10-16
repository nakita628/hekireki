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
