import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase, stripAnnotations } from '../utils/index.js'

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

// A composite FK uses Active Record 7.2's array form for
// foreign_key/primary_key; the single-column form stays a plain string.
function foreignKeyOpt(columns: readonly string[]) {
  return columns.length > 1
    ? `foreign_key: [${columns.map((c) => `:${c}`).join(', ')}]`
    : `foreign_key: "${columns[0]}"`
}

// On the has side, primary_key names this model's own join column(s): without
// it a FK referencing a non-id unique column joins against id.
function hasPrimaryKeyOpt(columns: readonly string[]) {
  return columns.length > 1
    ? `, primary_key: [${columns.map((c) => `:${c}`).join(', ')}]`
    : columns[0] === 'id'
      ? ''
      : `, primary_key: "${columns[0]}"`
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    primaryKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    optional: boolean
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
  }[] = []
  const habtm: {
    name: string
    targetModel: string
    joinTable: string
    foreignKey: string
    associationForeignKey: string
  }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const targetModel = allModels.find((m) => m.name === field.type)
      const referencedField = field.relationToFields?.[0] ?? 'id'
      const referencedFields = field.relationToFields ?? ['id']
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn: fieldColumn(model, field.relationFromFields[0]),
        primaryKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
        foreignKeyColumns: field.relationFromFields.map((c) => fieldColumn(model, c)),
        primaryKeyColumns: referencedFields.map((c) =>
          targetModel ? fieldColumn(targetModel, c) : c,
        ),
        optional: !field.isRequired,
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        habtm.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignKey: model.name === left ? 'A' : 'B',
          associationForeignKey: model.name === left ? 'B' : 'A',
        })
        continue
      }
    }

    const fkField = targetModel.fields.find(
      (f) =>
        f.relationName === field.relationName &&
        f.relationFromFields &&
        f.relationFromFields.length > 0,
    )
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!foreignKey) continue
    const foreignKeyColumn = fieldColumn(targetModel, foreignKey)
    const foreignKeyColumns = (fkField?.relationFromFields ?? [foreignKey]).map((c) =>
      fieldColumn(targetModel, c),
    )
    const primaryKeyColumns = (fkField?.relationToFields ?? ['id']).map((c) =>
      fieldColumn(model, c),
    )

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, habtm }
}

export function activeRecordModels(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const contextModels = allModels ?? models
  const enumMap = new Map((enums ?? []).map((e) => [e.name, e.values]))
  return models
    .map((model) => {
      const associations = getAssociations(model, contextModels)
      const tableName = model.dbName ?? makeSnakeCase(model.name)
      const idField = model.fields.find((f) => f.isId)
      const compositePkColumns = (model.primaryKey?.fields ?? []).map((name) =>
        fieldColumn(model, name),
      )

      const primaryKeyLines = idField
        ? (idField.dbName ?? idField.name) !== 'id'
          ? [`  self.primary_key = "${idField.dbName ?? idField.name}"`]
          : []
        : compositePkColumns.length > 0
          ? [`  self.primary_key = [${compositePkColumns.map((c) => `"${c}"`).join(', ')}]`]
          : []

      // A column named "type" triggers Rails single-table inheritance: reading
      // rows whose value is not a class name raises ActiveRecord::SubclassNotFound.
      const inheritanceColumnLines = model.fields.some(
        (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.dbName ?? f.name) === 'type',
      )
        ? ['  self.inheritance_column = nil']
        : []

      const attributeLines = model.fields
        .filter((f) => f.kind === 'scalar' && f.type === 'String')
        .flatMap((f) => {
          const def = f.default
          if (!(def && typeof def === 'object' && 'name' in def)) return []
          // SecureRandom.uuid_v7 requires Ruby 3.4+; ULID.generate requires the
          // ulid gem. No cast type is passed: a symbol type resolves through
          // the connection adapter at class load, while a bare default keeps
          // the column type untouched.
          const generator =
            def.name === 'uuid'
              ? 'args' in def && def.args[0] === 7
                ? 'SecureRandom.uuid_v7'
                : 'SecureRandom.uuid'
              : def.name === 'ulid'
                ? 'ULID.generate'
                : null
          if (generator === null) return []
          return [`  attribute :${f.dbName ?? f.name}, default: -> { ${generator} }`]
        })

      // Array enum columns get no `enum` DSL (it casts a scalar column), and a
      // second enum sharing value names with an earlier one on the same model
      // needs prefix: true — Active Record raises on the duplicate `VALUE?`
      // methods otherwise.
      const enumLines = model.fields
        .filter((f) => f.kind === 'enum' && !f.isList)
        .reduce<{ lines: string[]; seenValues: Set<string> }>(
          (acc, f) => {
            const values = enumMap.get(f.type) ?? []
            const pairs = values.map((v) => `${v.name}: "${v.dbName ?? v.name}"`).join(', ')
            const conflicts = values.some((v) => acc.seenValues.has(v.name))
            const prefixOpt = conflicts ? ', prefix: true' : ''
            for (const v of values) {
              acc.seenValues.add(v.name)
            }
            return {
              lines: [...acc.lines, `  enum :${f.dbName ?? f.name}, { ${pairs} }${prefixOpt}`],
              seenValues: acc.seenValues,
            }
          },
          { lines: [], seenValues: new Set() },
        ).lines

      const belongsToLines = associations.belongsTo.map((a) => {
        const primaryKeyOpt =
          a.primaryKeyColumns.length > 1
            ? `, primary_key: [${a.primaryKeyColumns.map((c) => `:${c}`).join(', ')}]`
            : a.primaryKeyColumn === 'id'
              ? ''
              : `, primary_key: "${a.primaryKeyColumn}"`
        const optionalOpt = a.optional ? ', optional: true' : ''
        return `  belongs_to :${makeSnakeCase(a.name)}, class_name: "${makePascalCase(a.targetModel)}", ${foreignKeyOpt(a.foreignKeyColumns)}${primaryKeyOpt}${optionalOpt}`
      })

      const hasOneLines = associations.hasOne.map(
        (a) =>
          `  has_one :${makeSnakeCase(a.name)}, class_name: "${makePascalCase(a.targetModel)}", ${foreignKeyOpt(a.foreignKeyColumns)}${hasPrimaryKeyOpt(a.primaryKeyColumns)}`,
      )

      const hasManyLines = associations.hasMany.map(
        (a) =>
          `  has_many :${makeSnakeCase(a.name)}, class_name: "${makePascalCase(a.targetModel)}", ${foreignKeyOpt(a.foreignKeyColumns)}${hasPrimaryKeyOpt(a.primaryKeyColumns)}`,
      )

      const habtmLines = associations.habtm.map(
        (a) =>
          `  has_and_belongs_to_many :${makeSnakeCase(a.name)}, class_name: "${makePascalCase(a.targetModel)}", join_table: "${a.joinTable}", foreign_key: "${a.foreignKey}", association_foreign_key: "${a.associationForeignKey}"`,
      )

      const associationLines = [...belongsToLines, ...hasOneLines, ...hasManyLines, ...habtmLines]

      const doc = stripAnnotations(model.documentation)
      const docLines = doc ? doc.split('\n').map((line) => `# ${line}`) : []

      const lines = [
        ...docLines,
        `class ${makePascalCase(model.name)} < ApplicationRecord`,
        `  self.table_name = "${tableName}"`,
        ...primaryKeyLines,
        ...inheritanceColumnLines,
        ...(attributeLines.length > 0 ? ['', ...attributeLines] : []),
        ...(enumLines.length > 0 ? ['', ...enumLines] : []),
        ...(associationLines.length > 0 ? ['', ...associationLines] : []),
        'end',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
