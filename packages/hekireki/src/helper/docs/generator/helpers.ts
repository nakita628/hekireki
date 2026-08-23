export const capitalize = (str: string) => str[0].toUpperCase() + str.slice(1)

export const lowerCase = (name: string) => name.substring(0, 1).toLowerCase() + name.substring(1)

const primitiveTypes = new Set(['String', 'Boolean', 'Int', 'Float', 'Json', 'DateTime', 'Null'])

export const isScalarType = (type: string) => primitiveTypes.has(type)
