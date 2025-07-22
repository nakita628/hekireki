import { isRelationship } from '../validator/index.js'

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
 * @returns The Mermaid connector string (e.g., `"||--}|"` or `"|o..}o"`).
 *
 * @throws If the input format is invalid or contains unknown relationship types.
 */
export function buildRelationLine(input: string): string {
  const parts = input.split('-to-')
  if (parts.length !== 2) {
    throw new Error(`Invalid input format: ${input}`)
  }

  const [toRaw, optionalFlag] = parts[1].includes('-optional')
    ? [parts[1].replace('-optional', ''), 'optional']
    : [parts[1], '']

  const from = parts[0]
  const to = toRaw
  const isOptional = optionalFlag === 'optional'

  if (!isRelationship(from)) {
    throw new Error(`Invalid relationship: ${from}`)
  }
  if (!isRelationship(to)) {
    throw new Error(`Invalid relationship: ${to}`)
  }

  const fromSymbol = RELATIONSHIPS[from]
  const toSymbol = RELATIONSHIPS[to]

  const connector = isOptional ? '..' : '--'

  return `${fromSymbol}${connector}${toSymbol}`
}
