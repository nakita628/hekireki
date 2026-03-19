import type { DMMF } from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'

import { writeFile, writeFileBinary } from '../fsp/index.js'
import { stripAnnotations } from '../utils/index.js'

// ============================================================================
// DBML Utilities
// ============================================================================

export function escapeNote(str: string): string {
  return str.replace(/'/g, "\\'")
}

export function formatConstraints(constraints: readonly string[]): string {
  return constraints.length > 0 ? ` [${constraints.join(', ')}]` : ''
}

export function makeEnum(enumDef: {
  readonly name: string
  readonly values: readonly string[]
}): string {
  return [`Enum ${enumDef.name} {`, ...enumDef.values.map((v) => `  ${v}`), '}'].join('\n')
}

export function makeRefName(ref: {
  readonly name?: string
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
}): string {
  return ref.name ?? `${ref.fromTable}_${ref.fromColumn}_${ref.toTable}_${ref.toColumn}_fk`
}

export function combineKeys(keys: readonly string[]): string {
  return keys.length > 1 ? `(${keys.join(', ')})` : keys[0]
}

// ============================================================================
// Composite functions (built from atomic utils)
// ============================================================================

function quote(value: string): string {
  return `'${escapeNote(value)}'`
}

function makeIndex(index: {
  readonly columns: readonly string[]
  readonly isPrimaryKey?: boolean
  readonly isUnique?: boolean
  readonly name?: string
}): string {
  const columns = index.columns.length > 1 ? `(${index.columns.join(', ')})` : index.columns[0]

  const constraints = [
    index.isPrimaryKey && 'pk',
    index.isUnique && 'unique',
    index.name && `name: '${index.name}'`,
  ].filter((c): c is string => Boolean(c))

  return `    ${columns}${formatConstraints(constraints)}`
}

function makeRef(ref: {
  readonly name?: string
  readonly fromTable: string
  readonly fromColumn: string
  readonly toTable: string
  readonly toColumn: string
  readonly type?: '>' | '<' | '-'
  readonly onDelete?: string
  readonly onUpdate?: string
}): string {
  const name = makeRefName(ref)
  const operator = ref.type ?? '>'

  const actions = [
    ref.onDelete && `delete: ${ref.onDelete}`,
    ref.onUpdate && `update: ${ref.onUpdate}`,
  ].filter((a): a is string => Boolean(a))

  const actionStr = actions.length > 0 ? ` [${actions.join(', ')}]` : ''

  return `Ref ${name}: ${ref.fromTable}.${ref.fromColumn} ${operator} ${ref.toTable}.${ref.toColumn}${actionStr}`
}

function makePrismaColumn(column: {
  readonly name: string
  readonly type: string
  readonly isPrimaryKey?: boolean
  readonly isUnique?: boolean
  readonly isNotNull?: boolean
  readonly isIncrement?: boolean
  readonly defaultValue?: string
  readonly note?: string
}): string {
  const constraints = [
    column.isPrimaryKey && 'pk',
    column.isIncrement && 'increment',
    column.defaultValue !== undefined && `default: ${column.defaultValue}`,
    column.isUnique && 'unique',
    column.isNotNull && 'not null',
    column.note && `note: ${quote(column.note)}`,
  ].filter((c): c is string => Boolean(c))

  return `  ${column.name} ${column.type}${formatConstraints(constraints)}`
}

// ============================================================================
// DBML Generation
// ============================================================================

function toDBMLColumn(field: DMMF.Field, models: readonly DMMF.Model[], mapToDbSchema: boolean) {
  const defaultDef = field.default as DMMF.FieldDefault | undefined

  const baseType = mapToDbSchema
    ? (models.find((m) => m.name === field.type)?.dbName ?? field.type)
    : field.type
  const type = field.isList && !field.relationName ? `${baseType}[]` : baseType

  const defaultValue = (() => {
    if (defaultDef?.name === 'autoincrement') return undefined
    if (defaultDef?.name === 'now') return '`now()`'
    if (field.hasDefaultValue && typeof field.default !== 'object') {
      return field.type === 'String' || field.type === 'Json' || field.kind === 'enum'
        ? `'${field.default}'`
        : String(field.default)
    }
    return undefined
  })()

  return {
    name: field.name,
    type,
    isPrimaryKey: field.isId,
    isIncrement: defaultDef?.name === 'autoincrement',
    isUnique: field.isUnique,
    isNotNull: field.isRequired && !field.isId,
    defaultValue,
    note: stripAnnotations(field.documentation),
  }
}

export function makeTables(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
): readonly string[] {
  return models.map((model) => {
    const modelName = mapToDbSchema && model.dbName ? model.dbName : model.name

    const columns = model.fields.map((field) => toDBMLColumn(field, models, mapToDbSchema))
    const columnLines = columns.map(makePrismaColumn).join('\n')

    const indexes = [
      ...(model.primaryKey?.fields && model.primaryKey.fields.length > 0
        ? [{ columns: model.primaryKey.fields, isPrimaryKey: true }]
        : []),
      ...model.uniqueFields
        .filter((c) => c.length > 1)
        .map((c) => ({ columns: c, isUnique: true })),
    ]
    const indexBlock =
      indexes.length > 0 ? `\n\n  indexes {\n${indexes.map(makeIndex).join('\n')}\n  }` : ''

    const strippedNote = stripAnnotations(model.documentation)
    const noteBlock = strippedNote ? `\n\n  Note: ${quote(escapeNote(strippedNote))}` : ''

    return `Table ${modelName} {\n${columnLines}${indexBlock}${noteBlock}\n}`
  })
}

export function makeEnums(enums: readonly DMMF.DatamodelEnum[]): readonly string[] {
  return enums.map((e) => {
    return makeEnum({
      name: e.name,
      values: e.values.map((v) => v.name),
    })
  })
}

export function makeRelations(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
): readonly string[] {
  return models.flatMap((model) =>
    model.fields
      .filter(
        (field) =>
          field.relationName && field.relationToFields?.length && field.relationFromFields?.length,
      )
      .map((field) => {
        const relationFrom = model.name
        const relationTo = field.type

        const toModel = models.find((m) => m.name === relationTo)
        const toField = toModel?.fields.find((f) => f.type === relationFrom)
        const operator: '>' | '<' | '-' = toField?.isList ? '>' : '-'

        const relationFromName = mapToDbSchema && model.dbName ? model.dbName : model.name
        const relatedModel = models.find((m) => m.name === relationTo)
        const relationToName =
          mapToDbSchema && relatedModel?.dbName ? relatedModel.dbName : relationTo

        const fromColumn = combineKeys(field.relationFromFields ?? [])
        const toColumn = combineKeys(field.relationToFields ?? [])

        return makeRef({
          name: `${relationFromName}_${fromColumn}_fk`,
          fromTable: relationFromName,
          fromColumn,
          toTable: relationToName,
          toColumn,
          type: operator,
          onDelete: field.relationOnDelete,
        })
      }),
  )
}

export function dbmlContent(datamodel: DMMF.Datamodel, mapToDbSchema = false): string {
  const tables = makeTables(datamodel.models, mapToDbSchema)
  const enums = makeEnums(datamodel.enums)
  const refs = makeRelations(datamodel.models, mapToDbSchema)

  return [...enums, ...tables, ...refs].join('\n\n')
}

export async function makeDbmlFile(
  outputDir: string,
  content: string,
  fileName: string,
): Promise<void> {
  const outputFile = `${outputDir}/${fileName}`
  await writeFile(outputFile, content)
}

export async function makePng(outputDir: string, dbml: string, fileName: string): Promise<void> {
  const outputFile = `${outputDir}/${fileName}`
  await makePngFile(outputFile, dbml)
}

export async function makePngFile(outputPath: string, dbml: string): Promise<void> {
  const svg = run(dbml, 'svg')
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  await writeFileBinary(outputPath, pngBuffer)
}
