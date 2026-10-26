/** What JSON can carry, which is all a YAML document written here holds. */
export type YamlValue =
  | string
  | number
  | boolean
  | null
  | readonly YamlValue[]
  | { readonly [key: string]: YamlValue }

/**
 * How a document is written: `flow` names the keys whose list of scalars goes on one line,
 * `[a, b]`, and `quote` the keys whose string is always written as a JSON string.
 */
export type YamlOptions = { readonly flow?: readonly string[]; readonly quote?: readonly string[] }

// A key that YAML reads back as the same string without quotes (`application/json` among them).
const PLAIN_KEY = /^[A-Za-z_$][A-Za-z0-9_$./-]*$/u

// Words YAML 1.1 readers turn into a boolean or null, and YAML 1.2 readers still do for some.
const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n', '~'])

// A version such as `3.1.0`: two dots keep it from being a number, so a reader keeps it a string.
const DOTTED_VERSION = /^\d+\.\d+\.\d+$/u

/**
 * Whether a string can stand unquoted: it opens with a letter (or is a dotted version), holds
 * none of the indicator characters, has no `: ` or ` #` a reader would cut it at, and is not a
 * word a reader turns into another type. Anything else is written as a JSON string, which YAML
 * reads as the same text.
 */
function isPlainScalar(text: string) {
  if (DOTTED_VERSION.test(text)) return true
  if (RESERVED.has(text.toLowerCase())) return false
  if (!/^[A-Za-z_$][^\n\r\t"'\\[\]{}&*!|>%@`,#]*$/u.test(text)) return false
  return !/(:\s|:$|\s$)/u.test(text)
}

/**
 * Whether a string with newlines can be a literal block: every line has to start where the block
 * does, since a first line indented further sets the indentation for the ones after it, and it
 * ends with one newline at most, which `|` keeps and `|-` has none of.
 */
function isLiteralBlock(text: string) {
  return (
    text.includes('\n') &&
    !text.includes('\r') &&
    !text.endsWith('\n\n') &&
    text.trim() !== '' &&
    text.split('\n').every((line) => !/^\s/u.test(line))
  )
}

/** The lines of a literal block: its indicator, then the text a level in. */
function literalBlock(text: string, indent: string) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return [
    `${indent}${text.endsWith('\n') ? '|' : '|-'}`,
    ...body.split('\n').map((line) => `${indent}  ${line}`),
  ]
}

function scalar(value: string | number | boolean | null) {
  if (typeof value === 'string') return isPlainScalar(value) ? value : JSON.stringify(value)
  return String(value)
}

function isList(value: YamlValue): value is readonly YamlValue[] {
  return Array.isArray(value)
}

function isRecord(value: YamlValue): value is { readonly [key: string]: YamlValue } {
  return typeof value === 'object' && value !== null && !isList(value)
}

function isScalar(value: YamlValue): value is string | number | boolean | null {
  return !isList(value) && !isRecord(value)
}

/** The lines of one map entry: `key: value` on one line, or `key:` over the lines of a collection. */
function entry(
  key: string,
  item: YamlValue,
  indent: string,
  options: YamlOptions,
): readonly string[] {
  const name = PLAIN_KEY.test(key) ? key : JSON.stringify(key)
  if (typeof item === 'string' && options.quote?.includes(key)) {
    return [`${indent}${name}: ${JSON.stringify(item)}`]
  }
  if (typeof item === 'string' && isLiteralBlock(item)) {
    const [indicator = '', ...body] = literalBlock(item, indent)
    return [`${indent}${name}: ${indicator.trimStart()}`, ...body]
  }
  if (isList(item) && item.length > 0) {
    if (options.flow?.includes(key) && item.every(isScalar)) {
      return [`${indent}${name}: [${item.map(scalar).join(', ')}]`]
    }
    return [`${indent}${name}:`, ...nested(item, `${indent}  `, options)]
  }
  if (isRecord(item) && Object.keys(item).length > 0) {
    return [`${indent}${name}:`, ...nested(item, `${indent}  `, options)]
  }
  return [`${indent}${name}: ${lines(item, '', options).join('')}`]
}

/** The lines of a value that follows `key:` or `-`, each indented by `indent`. */
function nested(value: YamlValue, indent: string, options: YamlOptions): readonly string[] {
  if (isList(value)) {
    // The item's first line follows the dash; the ones after it stay indented under it.
    return value.flatMap((item) =>
      lines(item, `${indent}  `, options).map((line, i) =>
        i === 0 ? `${indent}- ${line.trimStart()}` : line,
      ),
    )
  }
  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => entry(key, item, indent, options))
  }
  return [`${indent}${scalar(value)}`]
}

/** The lines a value takes on its own: a scalar is one line, an empty collection its brackets. */
function lines(value: YamlValue, indent: string, options: YamlOptions): readonly string[] {
  if (isList(value)) {
    return value.length === 0 ? [`${indent}[]`] : nested(value, indent, options)
  }
  if (isRecord(value)) {
    return Object.keys(value).length === 0 ? [`${indent}{}`] : nested(value, indent, options)
  }
  if (typeof value === 'string' && isLiteralBlock(value)) return literalBlock(value, indent)
  return [`${indent}${scalar(value)}`]
}

/**
 * A value as a YAML document in block style, two spaces per level, ending in a newline.
 *
 * Keys and strings stand unquoted where YAML reads them back unchanged and as JSON strings
 * otherwise; a string with newlines is a literal block, `|` when it ends with one. A list of
 * scalars under a key `flow` names is written on its line, `[a, b]`, and a string under a key
 * `quote` names always as a JSON string. What `JSON.stringify` would write for the value, YAML
 * reads from this.
 */
export function toYaml(value: YamlValue, options: YamlOptions = {}) {
  return `${lines(value, '', options).join('\n')}\n`
}
