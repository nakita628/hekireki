const SCALAR_TYPES = new Set(['String', 'Boolean', 'Int', 'Float', 'Json', 'DateTime', 'Null'])

/** Whether the type is a Prisma scalar (shown as text) rather than a client API type (linked). */
export function isScalarType(type: string) {
  return SCALAR_TYPES.has(type)
}
