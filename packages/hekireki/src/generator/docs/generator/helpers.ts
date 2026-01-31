import type { DMMFDocument } from './transformDMMF.js'

export interface Generatable<T> {
  data: T
  toHTML(): string
  getData(d: DMMFDocument): T
}

export const capitalize = (str: string): string => str[0].toUpperCase() + str.slice(1)

export const lowerCase = (name: string): string =>
  name.substring(0, 1).toLowerCase() + name.substring(1)

const primitiveTypes = ['String', 'Boolean', 'Int', 'Float', 'Json', 'DateTime', 'Null']

export const isScalarType = (type: string): boolean => primitiveTypes.includes(type)
