import type { DMMF } from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'
import { writeFile, writeFileBinary } from '../fsp/index.js'
import {
  combineKeys,
  escapeNote,
  formatConstraints,
  makeEnum,
  makeRefName,
  stripAnnotations,
} from '../utils/index.js'

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

function resolveFieldType(
  field: DMMF.Field,
  models: readonly DMMF.Model[],
  mapToDbSchema: boolean,
): string {
  const baseType = mapToDbSchema
    ? (models.find((m) => m.name === field.type)?.dbName ?? field.type)
    : field.type
  return field.isList && !field.relationName ? `${baseType}[]` : baseType
}

function resolveDefaultValue(field: DMMF.Field): string | undefined {
  const defaultDef = field.default as DMMF.FieldDefault | undefined
  if (defaultDef?.name === 'autoincrement') return undefined
  if (defaultDef?.name === 'now') return '`now()`'
  if (field.hasDefaultValue && typeof field.default !== 'object') {
    return field.type === 'String' || field.type === 'Json' || field.kind === 'enum'
      ? `'${field.default}'`
      : String(field.default)
  }
  return undefined
}

function toDBMLColumn(field: DMMF.Field, models: readonly DMMF.Model[], mapToDbSchema: boolean) {
  const defaultDef = field.default as DMMF.FieldDefault | undefined
  return {
    name: field.name,
    type: resolveFieldType(field, models, mapToDbSchema),
    isPrimaryKey: field.isId,
    isIncrement: defaultDef?.name === 'autoincrement',
    isUnique: field.isUnique,
    isNotNull: field.isRequired && !field.isId,
    defaultValue: resolveDefaultValue(field),
    note: stripAnnotations(field.documentation),
  }
}

function makeTableIndexes(model: DMMF.Model) {
  return [
    ...(model.primaryKey?.fields && model.primaryKey.fields.length > 0
      ? [{ columns: model.primaryKey.fields, isPrimaryKey: true }]
      : []),
    ...model.uniqueFields.filter((c) => c.length > 1).map((c) => ({ columns: c, isUnique: true })),
  ]
}

export function makeTables(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
): readonly string[] {
  return models.map((model) => {
    const modelName = mapToDbSchema && model.dbName ? model.dbName : model.name

    const columns = model.fields.map((field) => toDBMLColumn(field, models, mapToDbSchema))
    const columnLines = columns.map(makePrismaColumn).join('\n')

    const indexes = makeTableIndexes(model)
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

function getRelationOperator(
  models: readonly DMMF.Model[],
  from: string,
  to: string,
): '>' | '<' | '-' {
  const model = models.find((m) => m.name === to)
  const field = model?.fields.find((f) => f.type === from)
  return field?.isList ? '>' : '-'
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

        const operator = getRelationOperator(models, relationFrom, relationTo)

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

export const makeDbmlFile = async (
  outputDir: string,
  content: string,
  fileName: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const outputFile = `${outputDir}/${fileName}`
  const writeResult = await writeFile(outputFile, content)

  if (!writeResult.ok) {
    return { ok: false, error: `Failed to write DBML: ${writeResult.error}` }
  }

  return { ok: true }
}

export const makePng = async (
  outputDir: string,
  dbml: string,
  fileName: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const outputFile = `${outputDir}/${fileName}`
  return makePngFile(outputFile, dbml)
}

export const makePngFile = async (
  outputPath: string,
  dbml: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const svg = run(dbml, 'svg')
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
    },
  })
  const pngData = resvg.render()
  const pngBuffer = pngData.asPng()

  const writeResult = await writeFileBinary(outputPath, pngBuffer)

  if (!writeResult.ok) {
    return { ok: false, error: `Failed to write PNG: ${writeResult.error}` }
  }

  return { ok: true }
}
