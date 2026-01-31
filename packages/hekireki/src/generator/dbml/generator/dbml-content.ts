/**
 * DBML content generator for Prisma schemas
 *
 * Generates DBML (Database Markup Language) format from Prisma DMMF.
 * Uses utils-lab for common DBML generation functions.
 */

import type { DMMF } from '@prisma/generator-helper'
import {
  type DBMLColumn,
  type DBMLEnum,
  type DBMLIndex,
  type DBMLRef,
  escapeNote,
  formatConstraints,
  generateEnum,
  generateIndex,
  generateRef,
  quote,
} from 'utils-lab'

/**
 * Strip validation annotations (@z.*, @v.*, @a.*, @e.*) and relation annotations (@relation) from documentation
 */
function stripAnnotations(doc: string | undefined): string | undefined {
  if (!doc) return undefined
  const lines = doc.split('\n').filter((line) => {
    const trimmed = line.trim()
    return (
      !trimmed.startsWith('@z.') &&
      !trimmed.startsWith('@v.') &&
      !trimmed.startsWith('@a.') &&
      !trimmed.startsWith('@e.') &&
      !trimmed.startsWith('@relation')
    )
  })
  const result = lines.join('\n').trim()
  return result.length > 0 ? result : undefined
}

/**
 * Convert Prisma field to DBMLColumn
 */
function toDBMLColumn(
  field: DMMF.Field,
  models: readonly DMMF.Model[],
  mapToDbSchema: boolean,
): DBMLColumn {
  let fieldType = field.type

  if (mapToDbSchema) {
    const relatedModel = models.find((m) => m.name === field.type)
    if (relatedModel?.dbName) {
      fieldType = relatedModel.dbName
    }
  }

  if (field.isList && !field.relationName) {
    fieldType = `${fieldType}[]`
  }

  // Determine default value
  let defaultValue: string | undefined
  const defaultDef = field.default as DMMF.FieldDefault | undefined

  if (defaultDef?.name === 'autoincrement') {
    // Handled by isIncrement
  } else if (defaultDef?.name === 'now') {
    defaultValue = '`now()`'
  } else if (field.hasDefaultValue && typeof field.default !== 'object') {
    if (field.type === 'String' || field.type === 'Json' || field.kind === 'enum') {
      defaultValue = `'${field.default}'`
    } else {
      defaultValue = String(field.default)
    }
  }

  return {
    name: field.name,
    type: fieldType,
    isPrimaryKey: field.isId,
    isIncrement: defaultDef?.name === 'autoincrement',
    isUnique: field.isUnique,
    isNotNull: field.isRequired && !field.isId,
    defaultValue,
    note: stripAnnotations(field.documentation),
  }
}

/**
 * Generate custom column line with Prisma-specific formatting
 */
function generatePrismaColumn(column: DBMLColumn): string {
  const constraints: string[] = []

  if (column.isPrimaryKey) {
    constraints.push('pk')
  }

  if (column.isIncrement) {
    constraints.push('increment')
  }

  if (column.defaultValue !== undefined) {
    constraints.push(`default: ${column.defaultValue}`)
  }

  if (column.isUnique) {
    constraints.push('unique')
  }

  if (column.isNotNull) {
    constraints.push('not null')
  }

  if (column.note) {
    constraints.push(`note: ${quote(column.note)}`)
  }

  return `  ${column.name} ${column.type}${formatConstraints(constraints)}`
}

/**
 * Generate table indexes block
 */
function generateTableIndexes(model: DMMF.Model): DBMLIndex[] {
  const indexes: DBMLIndex[] = []

  const primaryFields = model.primaryKey?.fields
  if (primaryFields && primaryFields.length > 0) {
    indexes.push({
      columns: primaryFields,
      isPrimaryKey: true,
    })
  }

  for (const composite of model.uniqueFields) {
    if (composite.length > 1) {
      indexes.push({
        columns: composite,
        isUnique: true,
      })
    }
  }

  return indexes
}

/**
 * Generate table definitions
 */
export function generateTables(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
  includeRelationFields = true,
): readonly string[] {
  return models.map((model) => {
    const modelName = mapToDbSchema && model.dbName ? model.dbName : model.name

    const filteredFields = includeRelationFields
      ? model.fields
      : model.fields.filter((field) => !field.relationName)

    const columns = filteredFields.map((field) => toDBMLColumn(field, models, mapToDbSchema))
    const columnLines = columns.map(generatePrismaColumn).join('\n')

    const indexes = generateTableIndexes(model)
    const indexBlock =
      indexes.length > 0 ? `\n\n  indexes {\n${indexes.map(generateIndex).join('\n')}\n  }` : ''

    const strippedNote = stripAnnotations(model.documentation)
    const noteBlock = strippedNote ? `\n\n  Note: ${quote(escapeNote(strippedNote))}` : ''

    return `Table ${modelName} {\n${columnLines}${indexBlock}${noteBlock}\n}`
  })
}

/**
 * Generate enum definitions
 */
export function generateEnums(enums: readonly DMMF.DatamodelEnum[]): readonly string[] {
  return enums.map((e) => {
    const enumDef: DBMLEnum = {
      name: e.name,
      values: e.values.map((v) => v.name),
    }
    return generateEnum(enumDef)
  })
}

/**
 * Get relation operator based on cardinality
 */
function getRelationOperator(
  models: readonly DMMF.Model[],
  from: string,
  to: string,
): '>' | '<' | '-' {
  const model = models.find((m) => m.name === to)
  const field = model?.fields.find((f) => f.type === from)
  return field?.isList ? '>' : '-'
}

/**
 * Combine keys for composite foreign keys
 */
function combineKeys(keys: string[]): string {
  return keys.length > 1 ? `(${keys.join(', ')})` : keys[0]
}

/**
 * Generate foreign key references
 */
export function generateRelations(
  models: readonly DMMF.Model[],
  mapToDbSchema = false,
): readonly string[] {
  const refs: string[] = []

  for (const model of models) {
    const relFields = model.fields.filter(
      (field) =>
        field.relationName && field.relationToFields?.length && field.relationFromFields?.length,
    )

    for (const field of relFields) {
      const relationFrom = model.name
      const relationTo = field.type

      const operator = getRelationOperator(models, relationFrom, relationTo)

      const relationFromName = mapToDbSchema && model.dbName ? model.dbName : model.name
      const relatedModel = models.find((m) => m.name === relationTo)
      const relationToName =
        mapToDbSchema && relatedModel?.dbName ? relatedModel.dbName : relationTo

      const fromColumn = combineKeys(field.relationFromFields ?? [])
      const toColumn = combineKeys(field.relationToFields ?? [])

      const ref: DBMLRef = {
        name: `${relationFromName}_${fromColumn}_fk`,
        fromTable: relationFromName,
        fromColumn,
        toTable: relationToName,
        toColumn,
        type: operator,
        onDelete: field.relationOnDelete,
      }

      refs.push(generateRef(ref))
    }
  }

  return refs
}

/**
 * Generate complete DBML content from Prisma DMMF
 */
export function dbmlContent(
  datamodel: DMMF.Datamodel,
  mapToDbSchema = false,
  includeRelationFields = true,
): string {
  const tables = generateTables(datamodel.models, mapToDbSchema, includeRelationFields)
  const enums = generateEnums(datamodel.enums)
  const refs = generateRelations(datamodel.models, mapToDbSchema)

  return [...enums, ...tables, ...refs].join('\n\n')
}
