import type { DMMF } from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'
import { writeFile, writeFileBinary } from '../fsp/index.js'
import {
  combineKeys,
  escapeNote,
  generateEnum,
  generateIndex,
  generatePrismaColumn,
  generateRef,
  quote,
  stripAnnotations,
} from '../utils/index.js'

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

function generateTableIndexes(model: DMMF.Model) {
  return [
    ...(model.primaryKey?.fields && model.primaryKey.fields.length > 0
      ? [{ columns: model.primaryKey.fields, isPrimaryKey: true }]
      : []),
    ...model.uniqueFields.filter((c) => c.length > 1).map((c) => ({ columns: c, isUnique: true })),
  ]
}

export function generateTables(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
): readonly string[] {
  return models.map((model) => {
    const modelName = mapToDbSchema && model.dbName ? model.dbName : model.name

    const columns = model.fields.map((field) => toDBMLColumn(field, models, mapToDbSchema))
    const columnLines = columns.map(generatePrismaColumn).join('\n')

    const indexes = generateTableIndexes(model)
    const indexBlock =
      indexes.length > 0 ? `\n\n  indexes {\n${indexes.map(generateIndex).join('\n')}\n  }` : ''

    const strippedNote = stripAnnotations(model.documentation)
    const noteBlock = strippedNote ? `\n\n  Note: ${quote(escapeNote(strippedNote))}` : ''

    return `Table ${modelName} {\n${columnLines}${indexBlock}${noteBlock}\n}`
  })
}

export function generateEnums(enums: readonly DMMF.DatamodelEnum[]): readonly string[] {
  return enums.map((e) => {
    return generateEnum({
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

export function generateRelations(
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

        return generateRef({
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
  const tables = generateTables(datamodel.models, mapToDbSchema)
  const enums = generateEnums(datamodel.enums)
  const refs = generateRelations(datamodel.models, mapToDbSchema)

  return [...enums, ...tables, ...refs].join('\n\n')
}

export const generateDbmlFile = async (
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

export const generatePng = async (
  outputDir: string,
  dbml: string,
  fileName: string,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
  const outputFile = `${outputDir}/${fileName}`
  return generatePngFile(outputFile, dbml)
}

export const generatePngFile = async (
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
