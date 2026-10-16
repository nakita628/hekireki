/**
 * A single-quoted TypeScript string literal: a backslash, a quote and a line break are escaped, so
 * a name holding any of them (`@map("rock 'n' roll")`) is written as the string it is.
 */
export function tsString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `'${escaped}'`
}
