type Cell = string | number | boolean | null

type Parameter = {
  readonly index: number
  readonly placeholder: string
  readonly tsType: string
  readonly nullable: boolean | null
}

/**
 * The bound value for what was typed into a parameter field, read by the type the analysis
 * inferred: `NULL` (or an empty field on a nullable parameter) binds NULL, a number type parses
 * the digits, a boolean takes true / false / 1 / 0, and everything else binds as text.
 */
export function parseParamInput(parameter: Parameter, text: string): Cell {
  const trimmed = text.trim()
  if (trimmed === 'NULL' || (trimmed === '' && parameter.nullable === true)) return null
  if (parameter.tsType === 'number') {
    const parsed = Number(trimmed)
    return trimmed !== '' && !Number.isNaN(parsed) ? parsed : text
  }
  if (parameter.tsType === 'boolean') {
    return trimmed === 'true' || trimmed === '1'
  }
  return text
}

/** A sample value for a parameter that has none yet, so a statement can run at once. */
export function defaultParamInput(parameter: Parameter) {
  if (parameter.tsType === 'number') return '1'
  if (parameter.tsType === 'boolean') return 'true'
  if (parameter.tsType === 'string') return ''
  return ''
}

/** The values to bind, in the order the placeholders bind: one per distinct parameter. */
export function bindValues(
  parameters: readonly Parameter[],
  inputs: Readonly<Record<string, string>>,
): readonly Cell[] {
  return parameters.map((parameter) =>
    parseParamInput(parameter, inputs[paramKey(parameter)] ?? defaultParamInput(parameter)),
  )
}

/** What a parameter is remembered by across edits: its placeholder for a named one, its position otherwise. */
export function paramKey(parameter: Parameter) {
  return /^[:@$][A-Za-z_]/u.test(parameter.placeholder)
    ? parameter.placeholder
    : `#${parameter.index}`
}

/**
 * The parameter fields filled with values a statement was bound with, positional placeholders
 * (`?`, `$1`) keyed by their 1-based position as the analysis numbers them. A boolean is written
 * `1` / `0`, which a boolean parameter reads as true / false and a number one (SQLite and MySQL
 * keep booleans as integers) as the integer the database holds.
 */
export function paramInputsOf(values: readonly Cell[]): Readonly<Record<string, string>> {
  return Object.fromEntries(
    values.map((value, index) => [
      `#${index + 1}`,
      value === null ? 'NULL' : typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
    ]),
  )
}
