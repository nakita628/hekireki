import type { DMMF } from '@prisma/generator-helper'

import type { SeedRow, SeedValue } from '../config.js'
import type { RowInput } from './context.js'
import { isSeedList } from './context.js'

/**
 * A given scalar as the column stores it, when the value can be read that way: an ISO string
 * becomes a Date, an integer a bigint, a number a decimal string, base64 text bytes. Anything else
 * is left as it is for validation to report.
 */
function normalizeScalar(field: DMMF.Field, value: SeedValue) {
  switch (field.type) {
    case 'DateTime': {
      if (typeof value !== 'string') return value
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date
    }
    case 'BigInt':
      if (typeof value === 'number' && Number.isInteger(value)) return BigInt(value)
      return typeof value === 'string' && /^-?\d+$/u.test(value) ? BigInt(value) : value
    case 'Decimal':
      return typeof value === 'number' && Number.isFinite(value) ? String(value) : value
    case 'Bytes':
      return typeof value === 'string' ? Uint8Array.from(Buffer.from(value, 'base64')) : value
    default:
      return value
  }
}

export function normalizeValue(field: DMMF.Field, value: SeedValue) {
  if (value === null || field.kind === 'enum') return value
  if (field.isList) {
    return isSeedList(value) ? value.map((item) => normalizeScalar(field, item)) : value
  }
  return normalizeScalar(field, value)
}

/** The given values of the row, each read as its column stores them. */
export function normalizeGiven(input: RowInput) {
  const { given, table } = input
  if (given === null) return {}
  const fitted: SeedRow = Object.fromEntries(
    table.columns
      .filter((column) => column.field in given)
      .map((column) => {
        const field = table.model.fields.find((f) => f.name === column.field)
        const value = given[column.field] ?? null
        return [column.field, field === undefined ? value : normalizeValue(field, value)]
      }),
  )
  return fitted
}
