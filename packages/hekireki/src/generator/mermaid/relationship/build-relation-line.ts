import { isRelationship } from '../validator/is-relationship'

const RELATION_SHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

export type Relationship = keyof typeof RELATION_SHIPS

/**
 * Builds a relationship line for mermaid from a string.
 * @param { string } input
 * @returns { string }
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

  if (!(isRelationship(from) && isRelationship(to))) {
    throw new Error(`Invalid relationship string: ${input}`)
  }

  const fromSymbol = RELATION_SHIPS[from]
  const toSymbol = RELATION_SHIPS[to]

  if (!(fromSymbol && toSymbol)) {
    throw new Error(`Invalid relationship string: ${input}`)
  }

  const connector = isOptional ? '..' : '--'

  return `${fromSymbol}${connector}${toSymbol}`
}
