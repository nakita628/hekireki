const RELATIONSHIPS = {
  'zero-one': '|o',
  one: '||',
  'zero-many': '}o',
  many: '}|',
} as const

export type Relationship = keyof typeof RELATIONSHIPS

function isRelationship(value: string): value is Relationship {
  return value in RELATIONSHIPS
}

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
