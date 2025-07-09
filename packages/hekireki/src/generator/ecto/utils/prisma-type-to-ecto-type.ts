export function prismaTypeToEctoType(
  type: string,
): 'integer' | 'string' | 'boolean' | 'utc_datetime' {
  if (type === 'Int') return 'integer'
  if (type === 'String') return 'string'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'utc_datetime'
  return 'string'
}
