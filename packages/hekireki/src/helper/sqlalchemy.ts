import { join } from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import { mkdir, writeFile } from '../fsp/index.js'
import { makeSnakeCase } from '../utils/index.js'

// ============================================================================
// SQLAlchemy Utilities
// ============================================================================

export function prismaTypeToSQLAlchemyType(type: string): string {
  if (type === 'String') return 'String'
  if (type === 'Int') return 'Integer'
  if (type === 'BigInt') return 'BigInteger'
  if (type === 'Float') return 'Float'
  if (type === 'Decimal') return 'Numeric'
  if (type === 'Boolean') return 'Boolean'
  if (type === 'DateTime') return 'DateTime'
  if (type === 'Json') return 'JSON'
  if (type === 'Bytes') return 'LargeBinary'
  return 'String'
}

export function prismaTypeToPythonType(type: string): string {
  if (type === 'String') return 'str'
  if (type === 'Int') return 'int'
  if (type === 'BigInt') return 'int'
  if (type === 'Float') return 'float'
  if (type === 'Decimal') return 'Decimal'
  if (type === 'Boolean') return 'bool'
  if (type === 'DateTime') return 'datetime'
  if (type === 'Json') return 'dict'
  if (type === 'Bytes') return 'bytes'
  return 'str'
}

interface BelongsToAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
  readonly references: string
}

interface HasAssoc {
  readonly name: string
  readonly targetModel: string
  readonly foreignKey: string
  readonly isList: boolean
}

function getAssociations(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
): {
  belongsTo: BelongsToAssoc[]
  hasMany: HasAssoc[]
  hasOne: HasAssoc[]
} {
  const belongsTo: BelongsToAssoc[] = []
  const hasMany: HasAssoc[] = []
  const hasOne: HasAssoc[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const fkFieldName = field.relationFromFields[0]
      const references = field.relationToFields?.[0] ?? 'id'
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: fkFieldName,
        references,
      })
    } else if (field.isList) {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) continue

      const fkField = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.relationFromFields &&
          f.relationFromFields.length > 0,
      )
      const foreignKey = fkField?.relationFromFields?.[0]
      if (!foreignKey) continue

      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        isList: true,
      })
    } else {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const fkField = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.relationFromFields &&
          f.relationFromFields.length > 0,
      )
      const foreignKey = fkField?.relationFromFields?.[0]
      if (!foreignKey) continue

      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKey,
        isList: false,
      })
    }
  }

  return { belongsTo, hasMany, hasOne }
}

function formatDefault(def: DMMF.Field['default']): string | null {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'True' : 'False'
  if (typeof def === 'number') return String(def)
  if (typeof def === 'string') return `"${def}"`
  return null
}

export function sqlalchemySchemas(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
): string {
  const contextModels = allModels ?? models
  return models
    .map((model) => generateModel(model, contextModels, enums))
    .filter(Boolean)
    .join('\n\n')
}

function generateModel(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
): string {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields ?? [])
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return ''

  const associations = getAssociations(model, allModels)
  const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

  const enumMap = new Map<string, readonly string[]>()
  if (enums) {
    for (const e of enums) {
      enumMap.set(
        e.name,
        e.values.map((v) => v.name),
      )
    }
  }

  // Collect imports
  const saTypeImports = new Set<string>()
  const needsForeignKey = belongsToFkFields.size > 0 || isCompositePk
  const needsRelationship =
    associations.belongsTo.length > 0 ||
    associations.hasMany.length > 0 ||
    associations.hasOne.length > 0
  const needsOptional = model.fields.some(
    (f) => !f.isRequired && f.kind !== 'object' && !belongsToFkFields.has(f.name),
  )
  const needsDecimal = model.fields.some((f) => f.type === 'Decimal')
  const needsDatetime = model.fields.some((f) => f.type === 'DateTime')

  // Determine SA column types needed
  for (const f of model.fields) {
    if (f.kind === 'object') continue
    if (f.kind === 'enum') {
      saTypeImports.add('Enum')
      saTypeImports.add('String')
      continue
    }
    saTypeImports.add(prismaTypeToSQLAlchemyType(f.type))
  }

  if (needsForeignKey) saTypeImports.add('ForeignKey')

  // Build import lines
  const saImports = [...saTypeImports].sort()
  const lines: string[] = []

  // sqlalchemy imports
  const saImportLine = `from sqlalchemy import ${saImports.join(', ')}`
  lines.push(saImportLine)

  // orm imports
  const ormImports = ['Mapped', 'mapped_column']
  if (needsRelationship) ormImports.push('relationship')
  lines.push(`from sqlalchemy.orm import ${ormImports.join(', ')}`)

  // typing imports
  const typingImports: string[] = []
  if (needsOptional) typingImports.push('Optional')
  if (typingImports.length > 0) {
    lines.push(`from typing import ${typingImports.join(', ')}`)
  }

  // stdlib imports
  if (needsDecimal) lines.push('from decimal import Decimal as DecimalType')
  if (needsDatetime) lines.push('from datetime import datetime')

  lines.push('')
  lines.push('from .base import Base')
  lines.push('')
  lines.push('')

  // Class definition
  const tableName = model.dbName ?? makeSnakeCase(model.name)
  lines.push(`class ${model.name}(Base):`)
  lines.push(`    __tablename__ = "${tableName}"`)

  // Columns
  const scalarFields = model.fields.filter(
    (f) => f.kind !== 'object',
  )

  for (const field of scalarFields) {
    lines.push('')
    const snakeName = makeSnakeCase(field.name)
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const isFk = belongsToFkFields.has(field.name)

    // Determine python type
    let pythonType: string
    if (field.kind === 'enum') {
      pythonType = 'str'
    } else {
      pythonType = prismaTypeToPythonType(field.type)
      if (pythonType === 'Decimal') pythonType = 'DecimalType'
    }

    // Wrap in Optional if nullable
    const typeHint = field.isRequired ? pythonType : `Optional[${pythonType}]`

    // Build mapped_column args
    const colArgs: string[] = []

    // SA type
    if (field.kind === 'enum') {
      const values = enumMap.get(field.type)
      const valuesStr = values ? values.map((v) => `"${v}"`).join(', ') : ''
      colArgs.push(`Enum(${valuesStr}, name="${makeSnakeCase(field.type)}")`)
    } else {
      colArgs.push(prismaTypeToSQLAlchemyType(field.type))
    }

    // ForeignKey
    if (isFk) {
      const assoc = associations.belongsTo.find((a) => a.foreignKey === field.name)
      if (assoc) {
        const targetTable = makeSnakeCase(assoc.targetModel)
        const targetCol = makeSnakeCase(assoc.references)
        colArgs.push(`ForeignKey("${targetTable}.${targetCol}")`)
      }
    }

    // primary_key
    if (isPk) colArgs.push('primary_key=True')

    // nullable
    if (!isPk) {
      colArgs.push(field.isRequired ? 'nullable=False' : 'nullable=True')
    }

    // default
    if (!isPk) {
      const defaultVal = formatDefault(field.default)
      if (defaultVal !== null) {
        colArgs.push(`default=${defaultVal}`)
      }
    }

    lines.push(`    ${snakeName}: Mapped[${typeHint}] = mapped_column(${colArgs.join(', ')})`)
  }

  // Relationships
  for (const assoc of associations.belongsTo) {
    lines.push('')
    const snakeName = makeSnakeCase(assoc.name)
    lines.push(
      `    ${snakeName}: Mapped["${assoc.targetModel}"] = relationship("${assoc.targetModel}", back_populates="${findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)}")`,
    )
  }

  for (const assoc of associations.hasMany) {
    lines.push('')
    const snakeName = makeSnakeCase(assoc.name)
    lines.push(
      `    ${snakeName}: Mapped[list["${assoc.targetModel}"]] = relationship("${assoc.targetModel}", back_populates="${findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)}")`,
    )
  }

  for (const assoc of associations.hasOne) {
    lines.push('')
    const snakeName = makeSnakeCase(assoc.name)
    lines.push(
      `    ${snakeName}: Mapped["${assoc.targetModel}"] = relationship("${assoc.targetModel}", back_populates="${findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)}", uselist=False)`,
    )
  }

  return lines.join('\n')
}

function findBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  foreignKey: string,
  allModels: readonly DMMF.Model[],
): string {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  // Find the relation field on the target model that points back to source
  // and matches the foreign key
  const backField = targetModel.fields.find((f) => {
    if (f.kind !== 'object') return false
    if (f.type !== sourceModelName) return false
    // For belongsTo on target side, check if its FK matches
    if (f.relationFromFields && f.relationFromFields.includes(foreignKey)) return true
    // For hasMany/hasOne on target side, find the matching relation
    const sourceModel = allModels.find((m) => m.name === sourceModelName)
    if (!sourceModel) return false
    const sourceFkField = sourceModel.fields.find(
      (sf) =>
        sf.relationName === f.relationName &&
        sf.relationFromFields &&
        sf.relationFromFields.includes(foreignKey),
    )
    return !!sourceFkField
  })

  return backField ? makeSnakeCase(backField.name) : makeSnakeCase(sourceModelName)
}

function generateBaseFile(): string {
  return `from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
`
}

function generateInitFile(models: readonly DMMF.Model[]): string {
  const imports = models
    .map((m) => `from .${makeSnakeCase(m.name)} import ${m.name}`)
    .join('\n')

  const all = models.map((m) => `    "${m.name}",`).join('\n')

  return `${imports}

__all__ = [
${all}
]
`
}

export async function writeSQLAlchemyModelsToFiles(
  models: readonly DMMF.Model[],
  outDir: string,
  enums?: readonly DMMF.DatamodelEnum[],
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  const mkdirResult = await mkdir(outDir)
  if (!mkdirResult.ok) {
    return mkdirResult
  }

  // Write base.py
  const baseResult = await writeFile(join(outDir, 'base.py'), generateBaseFile())
  if (!baseResult.ok) return baseResult
  console.log(`wrote ${join(outDir, 'base.py')}`)

  // Write individual model files
  for (const model of models) {
    const code = sqlalchemySchemas([model], models, enums)
    if (!code.trim()) continue

    const filePath = join(outDir, `${makeSnakeCase(model.name)}.py`)
    const writeResult = await writeFile(filePath, `${code}\n`)
    if (!writeResult.ok) {
      return writeResult
    }
    console.log(`wrote ${filePath}`)
  }

  // Write __init__.py
  const validModels = models.filter((m) => {
    const idField = m.fields.find((f) => f.isId)
    const isCompositePk = !idField && (m.primaryKey?.fields ?? []).length > 0
    return idField || isCompositePk
  })
  const initResult = await writeFile(join(outDir, '__init__.py'), generateInitFile(validModels))
  if (!initResult.ok) return initResult
  console.log(`wrote ${join(outDir, '__init__.py')}`)

  return { ok: true, value: undefined }
}
