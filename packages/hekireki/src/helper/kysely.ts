import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase } from '../utils/index.js'

const SCALAR_TYPE_MAP: { [k: string]: string } = {
  String: 'string',
  Boolean: 'boolean',
  Int: 'number',
  BigInt: 'bigint',
  Float: 'number',
  Decimal: 'string',
  DateTime: 'Timestamp',
  Json: 'unknown',
  Bytes: 'Buffer',
}

function makePropertyKey(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name)
    ? name
    : `'${name.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

function scalarTsType(type: string) {
  return SCALAR_TYPE_MAP[type] ?? 'unknown'
}

function makeColumnType(field: DMMF.Field) {
  const base = field.kind === 'enum' ? field.type : scalarTsType(field.type)
  const listed = field.isList ? `${base}[]` : base
  // `unknown | null` collapses to `unknown`, so the union would be redundant.
  const nullable = field.isRequired || listed === 'unknown' ? listed : `${listed} | null`
  return field.hasDefaultValue ? `Generated<${nullable}>` : nullable
}

export function makeTableInterface(model: DMMF.Model) {
  const columns = model.fields
    .filter((field) => field.kind === 'scalar' || field.kind === 'enum')
    .map((field) => `  ${makePropertyKey(field.dbName ?? field.name)}: ${makeColumnType(field)}`)
  return columns.length > 0
    ? `export interface ${model.name} {\n${columns.join('\n')}\n}`
    : `export interface ${model.name} {}`
}

export function makeEnumDeclarations(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  const usedEnumNames = new Set(
    models.flatMap((m) => m.fields.filter((f) => f.kind === 'enum').map((f) => f.type)),
  )
  return enums
    .filter((e) => usedEnumNames.has(e.name))
    .map(
      (e) =>
        `export type ${e.name} = ${e.values.map((v) => `'${v.dbName ?? v.name}'`).join(' | ')}`,
    )
}

function isImplicitM2M(field: DMMF.Field, models: readonly DMMF.Model[]) {
  if (field.kind !== 'object' || !field.isList) return false
  if (field.relationFromFields && field.relationFromFields.length > 0) return false
  const target = models.find((m) => m.name === field.type)
  const otherSide = target?.fields.find(
    (f) => f.kind === 'object' && f.relationName === field.relationName,
  )
  return otherSide?.isList === true
}

function pkTsType(modelName: string, models: readonly DMMF.Model[]) {
  const pkField = models.find((m) => m.name === modelName)?.fields.find((f) => f.isId)
  return pkField ? scalarTsType(pkField.type) : 'string'
}

// Prisma's implicit join table: `_<relationName>`, FK columns "A"/"B" typed
// after each side's PK (models in alphabetical order). Without it a Kysely
// query against the m2m storage has no table type at all.
export function collectM2MJoinEntries(models: readonly DMMF.Model[]) {
  const pairs = models.flatMap((model) =>
    model.fields
      .filter((field) => isImplicitM2M(field, models))
      .map((field) => {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        return { left, right, relationName: field.relationName ?? `${left}To${right}` }
      }),
  )
  const seen = new Set<string>()
  return pairs
    .filter((pair) => {
      if (seen.has(pair.relationName)) return false
      seen.add(pair.relationName)
      return true
    })
    .map((pair) => ({
      interfaceName: makePascalCase(makeSnakeCase(pair.relationName)),
      tableName: `_${pair.relationName}`,
      aType: pkTsType(pair.left, models),
      bType: pkTsType(pair.right, models),
    }))
}

export function makeM2MJoinInterface(entry: {
  readonly interfaceName: string
  readonly aType: string
  readonly bType: string
}) {
  return `export interface ${entry.interfaceName} {\n  A: ${entry.aType}\n  B: ${entry.bType}\n}`
}

export function makeDbInterface(
  models: readonly DMMF.Model[],
  joinEntries: readonly { readonly interfaceName: string; readonly tableName: string }[],
) {
  const lines = [
    ...models.map((m) => `  ${makePropertyKey(m.dbName ?? m.name)}: ${m.name}`),
    ...joinEntries.map((e) => `  ${makePropertyKey(e.tableName)}: ${e.interfaceName}`),
  ]
  return lines.length > 0
    ? `export interface DB {\n${lines.join('\n')}\n}`
    : 'export interface DB {}'
}
