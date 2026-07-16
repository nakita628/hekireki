import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase, stripAnnotations } from '../utils/index.js'

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    primaryKeyColumn: string
    optional: boolean
  }[] = []
  const hasMany: { name: string; targetModel: string; foreignKeyColumn: string }[] = []
  const hasOne: { name: string; targetModel: string; foreignKeyColumn: string }[] = []
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
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn: fieldColumn(model, field.relationFromFields[0]),
        primaryKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
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

    if (field.isList) {
      hasMany.push({ name: field.name, targetModel: field.type, foreignKeyColumn })
    } else {
      hasOne.push({ name: field.name, targetModel: field.type, foreignKeyColumn })
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

      const attributeLines = model.fields
        .filter((f) => f.kind === 'scalar' && f.type === 'String')
        .flatMap((f) => {
          const def = f.default
          if (!(def && typeof def === 'object' && 'name' in def && def.name === 'uuid')) return []
          // SecureRandom.uuid_v7 requires Ruby 3.4+. No cast type is passed:
          // a symbol type resolves through the connection adapter at class
          // load, while a bare default keeps the column type untouched.
          const generator =
            'args' in def && def.args[0] === 7 ? 'SecureRandom.uuid_v7' : 'SecureRandom.uuid'
          return [`  attribute :${f.dbName ?? f.name}, default: -> { ${generator} }`]
        })

      const enumLines = model.fields
        .filter((f) => f.kind === 'enum')
        .map((f) => {
          const values = enumMap.get(f.type) ?? []
          const pairs = values.map((v) => `${v.name}: "${v.dbName ?? v.name}"`).join(', ')
          return `  enum :${f.dbName ?? f.name}, { ${pairs} }`
        })

      const belongsToLines = associations.belongsTo.map((a) => {
        const primaryKeyOpt =
          a.primaryKeyColumn === 'id' ? '' : `, primary_key: "${a.primaryKeyColumn}"`
        const optionalOpt = a.optional ? ', optional: true' : ''
        return `  belongs_to :${makeSnakeCase(a.name)}, class_name: "${a.targetModel}", foreign_key: "${a.foreignKeyColumn}"${primaryKeyOpt}${optionalOpt}`
      })

      const hasOneLines = associations.hasOne.map(
        (a) =>
          `  has_one :${makeSnakeCase(a.name)}, class_name: "${a.targetModel}", foreign_key: "${a.foreignKeyColumn}"`,
      )

      const hasManyLines = associations.hasMany.map(
        (a) =>
          `  has_many :${makeSnakeCase(a.name)}, class_name: "${a.targetModel}", foreign_key: "${a.foreignKeyColumn}"`,
      )

      const habtmLines = associations.habtm.map(
        (a) =>
          `  has_and_belongs_to_many :${makeSnakeCase(a.name)}, class_name: "${a.targetModel}", join_table: "${a.joinTable}", foreign_key: "${a.foreignKey}", association_foreign_key: "${a.associationForeignKey}"`,
      )

      const associationLines = [...belongsToLines, ...hasOneLines, ...hasManyLines, ...habtmLines]

      const doc = stripAnnotations(model.documentation)
      const docLines = doc ? doc.split('\n').map((line) => `# ${line}`) : []

      const lines = [
        ...docLines,
        `class ${model.name} < ApplicationRecord`,
        `  self.table_name = "${tableName}"`,
        ...primaryKeyLines,
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
