import { isRelationshipType } from 'utils-lab'

const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

/**
 * Generate a Mermaid ER diagram relation connector from a custom relationship string.
 *
 * @param input - A relationship string like `"one-to-many"` or `"zero-one-to-one-optional"`.
 * @returns A Result containing the Mermaid connector string (e.g., `"||--}|"` or `"|o..}o"`), or an error.
 */
export function buildRelationLine(input: string):
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string } {
  const parts = input.split('-to-')
  if (parts.length !== 2) {
    return { ok: false, error: `Invalid input format: ${input}` }
  }
  const [toRaw, optionalFlag] = parts[1].includes('-optional')
    ? [parts[1].replace('-optional', ''), 'optional']
    : [parts[1], '']
  const from = parts[0]
  const to = toRaw
  const isOptional = optionalFlag === 'optional'
  if (!isRelationshipType(from)) {
    return { ok: false, error: `Invalid relationship: ${from}` }
  }
  if (!isRelationshipType(to)) {
    return { ok: false, error: `Invalid relationship: ${to}` }
  }
  const fromSymbol = RELATIONSHIPS[from]
  const toSymbol = RELATIONSHIPS[to]
  const connector = isOptional ? '..' : '--'
  return { ok: true, value: `${fromSymbol}${connector}${toSymbol}` }
}
