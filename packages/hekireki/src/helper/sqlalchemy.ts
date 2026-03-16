import { dirname } from 'node:path'
import type { DMMF } from '@prisma/generator-helper'
import { mkdir, writeFile } from '../fsp/index.js'
import { makeSnakeCase } from '../utils/index.js'

// ============================================================================
// Type Mappings
// ============================================================================

const PRISMA_TO_PYTHON: Record<string, string> = {
  String: 'str',
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'datetime',
  Json: 'dict',
  Bytes: 'bytes',
}

const PRISMA_TO_SQLALCHEMY: Record<string, string> = {
  String: 'String',
  Int: 'Integer',
  BigInt: 'BigInteger',
  Float: 'Float',
  Decimal: 'Numeric',
  Boolean: 'Boolean',
  DateTime: 'DateTime',
  Json: 'JSON',
  Bytes: 'LargeBinary',
}

export function prismaTypeToSQLAlchemyType(type: string): string {
  return PRISMA_TO_SQLALCHEMY[type] ?? 'String'
}

export function prismaTypeToPythonType(type: string): string {
  return PRISMA_TO_PYTHON[type] ?? 'str'
}

// ============================================================================
// Native Type Resolution
// ============================================================================

function resolveNativeType(field: DMMF.Field): string {
  const baseType = prismaTypeToSQLAlchemyType(field.type)
  if (!field.nativeType) return baseType

  const [nativeName, nativeArgs] = field.nativeType as [string, readonly (string | number)[]]
  const args = nativeArgs ?? []

  switch (nativeName) {
    case 'VarChar':
    case 'Char':
      return args.length > 0 ? `String(${args[0]})` : 'String'
    case 'Text':
    case 'MediumText':
    case 'LongText':
    case 'TinyText':
      return 'Text'
    case 'SmallInt':
    case 'TinyInt':
      return 'SmallInteger'
    case 'MediumInt':
      return 'Integer'
    case 'DoublePrecision':
    case 'Double':
    case 'Real':
      return 'Double'
    case 'Decimal':
    case 'Money':
      return args.length >= 2 ? `Numeric(precision=${args[0]}, scale=${args[1]})` : 'Numeric'
    case 'Uuid':
      return 'Uuid'
    case 'Timestamp':
      return 'DateTime'
    case 'Date':
      return 'Date'
    case 'Time':
      return 'Time'
    case 'JsonB':
      return 'JSON'
    case 'Xml':
      return 'String'
    default:
      return baseType
  }
}

function needsExplicitSaType(field: DMMF.Field): boolean {
  if (field.kind === 'enum') return true
  if (field.nativeType) {
    const resolved = resolveNativeType(field)
    if (resolved !== prismaTypeToSQLAlchemyType(field.type)) return true
  }
  return false
}

function pythonTypeForNative(field: DMMF.Field): string {
  if (!field.nativeType) {
    const raw = prismaTypeToPythonType(field.type)
    return raw === 'Decimal' ? 'DecimalType' : raw
  }
  const [nativeName] = field.nativeType as [string, readonly (string | number)[]]
  if (nativeName === 'Uuid') return 'uuid_mod.UUID'
  if (nativeName === 'Date') return 'date'
  if (nativeName === 'Time') return 'time_type'
  const raw = prismaTypeToPythonType(field.type)
  return raw === 'Decimal' ? 'DecimalType' : raw
}

// ============================================================================
// Association Types
// ============================================================================

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

interface ManyToManyAssoc {
  readonly name: string
  readonly targetModel: string
  readonly relationName: string
}

interface Associations {
  readonly belongsTo: readonly BelongsToAssoc[]
  readonly hasMany: readonly HasAssoc[]
  readonly hasOne: readonly HasAssoc[]
  readonly manyToMany: readonly ManyToManyAssoc[]
}

// ============================================================================
// Association Detection
// ============================================================================

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]): Associations {
  const belongsTo: BelongsToAssoc[] = []
  const hasMany: HasAssoc[] = []
  const hasOne: HasAssoc[] = []
  const manyToMany: ManyToManyAssoc[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        references: field.relationToFields?.[0] ?? 'id',
      })
    } else if (field.isList) {
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )

      if (otherSide?.isList) {
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          relationName: field.relationName ?? `${model.name}To${field.type}`,
        })
      } else {
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
      }
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

  return { belongsTo, hasMany, hasOne, manyToMany }
}

// ============================================================================
// Many-to-Many Association Table
// ============================================================================

interface M2MTableInfo {
  readonly tableName: string
  readonly varName: string
  readonly leftModel: string
  readonly leftTable: string
  readonly leftPkField: DMMF.Field | undefined
  readonly rightModel: string
  readonly rightTable: string
  readonly rightPkField: DMMF.Field | undefined
}

function collectManyToManyTables(allModels: readonly DMMF.Model[]): readonly M2MTableInfo[] {
  const seen = new Set<string>()
  const tables: M2MTableInfo[] = []

  for (const model of allModels) {
    for (const field of model.fields) {
      if (field.kind !== 'object' || !field.isList) continue
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) continue

      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (!otherSide?.isList) continue

      const relationName = field.relationName ?? `${model.name}To${field.type}`
      if (seen.has(relationName)) continue
      seen.add(relationName)

      const [leftName, rightName] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]
      const leftModelObj = allModels.find((m) => m.name === leftName)
      const rightModelObj = allModels.find((m) => m.name === rightName)

      tables.push({
        tableName: `_${leftName}To${rightName}`,
        varName: `${makeSnakeCase(leftName)}_to_${makeSnakeCase(rightName)}`,
        leftModel: leftName,
        leftTable: leftModelObj?.dbName ?? makeSnakeCase(leftName),
        leftPkField: leftModelObj?.fields.find((f) => f.isId),
        rightModel: rightName,
        rightTable: rightModelObj?.dbName ?? makeSnakeCase(rightName),
        rightPkField: rightModelObj?.fields.find((f) => f.isId),
      })
    }
  }

  return tables
}

function generateAssociationTable(info: M2MTableInfo): string {
  const leftSaType = info.leftPkField ? resolveNativeType(info.leftPkField) : 'String'
  const rightSaType = info.rightPkField ? resolveNativeType(info.rightPkField) : 'String'
  const leftPkCol =
    info.leftPkField?.dbName ?? (info.leftPkField ? makeSnakeCase(info.leftPkField.name) : 'id')
  const rightPkCol =
    info.rightPkField?.dbName ?? (info.rightPkField ? makeSnakeCase(info.rightPkField.name) : 'id')

  return [
    `${info.varName} = Table(`,
    `    "${info.tableName}",`,
    '    Base.metadata,',
    `    Column("A", ${leftSaType}, ForeignKey("${info.leftTable}.${leftPkCol}"), primary_key=True),`,
    `    Column("B", ${rightSaType}, ForeignKey("${info.rightTable}.${rightPkCol}"), primary_key=True),`,
    ')',
  ].join('\n')
}

// ============================================================================
// Default Value Handling
// ============================================================================

function formatDefault(def: DMMF.Field['default']): string | null {
  if (def === undefined || def === null) return null
  if (typeof def === 'boolean') return def ? 'True' : 'False'
  if (typeof def === 'number') return String(def)
  if (typeof def === 'string') return `"${def}"`
  return null
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def
}

function isAutoincrement(field: DMMF.Field): boolean {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

// ============================================================================
// Disambiguation
// ============================================================================

function needsForeignKeysParam(
  targetModel: string,
  assocs: readonly BelongsToAssoc[] | readonly HasAssoc[],
): boolean {
  return assocs.filter((a) => a.targetModel === targetModel).length > 1
}

function findBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  foreignKey: string,
  allModels: readonly DMMF.Model[],
): string {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  const backField = targetModel.fields.find((f) => {
    if (f.kind !== 'object') return false
    if (f.type !== sourceModelName) return false
    if (f.relationFromFields?.includes(foreignKey)) return true
    const sourceModel = allModels.find((m) => m.name === sourceModelName)
    if (!sourceModel) return false
    return sourceModel.fields.some(
      (sf) =>
        sf.relationName === f.relationName &&
        sf.relationFromFields &&
        sf.relationFromFields.includes(foreignKey),
    )
  })

  return backField ? makeSnakeCase(backField.name) : makeSnakeCase(sourceModelName)
}

function findM2MBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  relationName: string,
  allModels: readonly DMMF.Model[],
): string {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  const backField = targetModel.fields.find(
    (f) => f.kind === 'object' && f.type === sourceModelName && f.relationName === relationName,
  )
  return backField ? makeSnakeCase(backField.name) : makeSnakeCase(sourceModelName)
}

// ============================================================================
// Column Generation
// ============================================================================

function generateColumn(
  field: DMMF.Field,
  isPk: boolean,
  isFk: boolean,
  associations: Associations,
  allModels: readonly DMMF.Model[],
  enumMap: ReadonlyMap<string, readonly string[]>,
): string {
  const snakeName = field.dbName ?? makeSnakeCase(field.name)
  const pythonType = field.kind === 'enum' ? 'str' : pythonTypeForNative(field)
  const typeHint = field.isRequired ? pythonType : `Optional[${pythonType}]`

  const colArgs: string[] = []

  if (field.kind === 'enum') {
    const values = enumMap.get(field.type)
    const valuesStr = values ? values.map((v) => `"${v}"`).join(', ') : ''
    colArgs.push(`Enum(${valuesStr}, name="${makeSnakeCase(field.type)}")`)
  } else if (needsExplicitSaType(field)) {
    colArgs.push(resolveNativeType(field))
  }

  if (isFk) {
    const assoc = associations.belongsTo.find((a) => a.foreignKey === field.name)
    if (assoc) {
      const targetModelObj = allModels.find((m) => m.name === assoc.targetModel)
      const targetTable = targetModelObj?.dbName ?? makeSnakeCase(assoc.targetModel)
      const targetCol = makeSnakeCase(assoc.references)
      colArgs.push(`ForeignKey("${targetTable}.${targetCol}")`)
    }
  }

  if (isPk) colArgs.push('primary_key=True')
  if (isPk && isAutoincrement(field)) colArgs.push('autoincrement=True')
  if (field.isUnique) colArgs.push('unique=True')

  if (
    field.type === 'DateTime' &&
    isFunctionDefault(field.default) &&
    field.default.name === 'now'
  ) {
    colArgs.push('server_default=func.now()')
  } else if (!isPk || isAutoincrement(field)) {
    const defaultVal = formatDefault(field.default)
    if (defaultVal !== null && !isPk) {
      colArgs.push(`default=${defaultVal}`)
    }
  }

  if (field.isUpdatedAt) {
    colArgs.push('onupdate=func.now()')
  }

  if (colArgs.length === 0) {
    return `    ${snakeName}: Mapped[${typeHint}]`
  }

  return `    ${snakeName}: Mapped[${typeHint}] = mapped_column(${colArgs.join(', ')})`
}

// ============================================================================
// __table_args__ Generation
// ============================================================================

function generateTableArgs(model: DMMF.Model, indexes: readonly DMMF.Index[]): readonly string[] {
  const uniqueConstraints = model.uniqueFields.map((fields) => {
    const cols = fields.map((f) => {
      const fieldObj = model.fields.find((mf) => mf.name === f)
      return `"${fieldObj?.dbName ?? makeSnakeCase(f)}"`
    })
    return `UniqueConstraint(${cols.join(', ')})`
  })

  const indexConstraints = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .map((idx) => {
      const idxName =
        idx.dbName ?? idx.name ?? `idx_${idx.fields.map((f) => makeSnakeCase(f.name)).join('_')}`
      const cols = idx.fields.map((f) => {
        const fieldObj = model.fields.find((mf) => mf.name === f.name)
        return `"${fieldObj?.dbName ?? makeSnakeCase(f.name)}"`
      })
      return `Index("${idxName}", ${cols.join(', ')})`
    })

  const allConstraints = [...uniqueConstraints, ...indexConstraints]
  if (allConstraints.length === 0) return []

  return ['', '    __table_args__ = (', ...allConstraints.map((c) => `        ${c},`), '    )']
}

// ============================================================================
// Relationship Generation
// ============================================================================

function generateBelongsToRelationships(
  associations: Associations,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
): readonly string[] {
  return associations.belongsTo.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const fkFieldObj = model.fields.find((f) => f.name === assoc.foreignKey)
    const snakeFk = fkFieldObj?.dbName ?? makeSnakeCase(assoc.foreignKey)
    const backPop = findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)
    const needsFkParam = needsForeignKeysParam(assoc.targetModel, associations.belongsTo)
    const fkClause = needsFkParam ? `foreign_keys=[${snakeFk}], ` : ''
    return `    ${snakeName}: Mapped["${assoc.targetModel}"] = relationship(${fkClause}back_populates="${backPop}")`
  })
}

function generateHasManyRelationships(
  associations: Associations,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
): readonly string[] {
  return associations.hasMany.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const backPop = findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)
    const targetModel = allModels.find((m) => m.name === assoc.targetModel)
    const needsFkParam = targetModel
      ? needsForeignKeysParam(model.name, getAssociations(targetModel, allModels).belongsTo)
      : false
    const targetFkSnake = makeSnakeCase(assoc.foreignKey)
    const fkClause = needsFkParam ? `foreign_keys="${assoc.targetModel}.${targetFkSnake}", ` : ''
    return `    ${snakeName}: Mapped[list["${assoc.targetModel}"]] = relationship(${fkClause}back_populates="${backPop}")`
  })
}

function generateHasOneRelationships(
  associations: Associations,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
): readonly string[] {
  return associations.hasOne.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const backPop = findBackPopulates(assoc.targetModel, model.name, assoc.foreignKey, allModels)
    const targetModel = allModels.find((m) => m.name === assoc.targetModel)
    const needsFkParam = targetModel
      ? needsForeignKeysParam(model.name, getAssociations(targetModel, allModels).belongsTo)
      : false
    const targetFkSnake = makeSnakeCase(assoc.foreignKey)
    const fkClause = needsFkParam ? `foreign_keys="${assoc.targetModel}.${targetFkSnake}", ` : ''
    return `    ${snakeName}: Mapped["${assoc.targetModel}"] = relationship(${fkClause}back_populates="${backPop}", uselist=False)`
  })
}

function generateManyToManyRelationships(
  associations: Associations,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  m2mTables: readonly M2MTableInfo[],
): readonly string[] {
  return associations.manyToMany.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const backPop = findM2MBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.relationName,
      allModels,
    )

    const [leftName, rightName] =
      model.name < assoc.targetModel
        ? [model.name, assoc.targetModel]
        : [assoc.targetModel, model.name]
    const table = m2mTables.find((t) => t.leftModel === leftName && t.rightModel === rightName)
    const secondaryVar =
      table?.varName ?? `${makeSnakeCase(leftName)}_to_${makeSnakeCase(rightName)}`

    return `    ${snakeName}: Mapped[list["${assoc.targetModel}"]] = relationship(secondary=${secondaryVar}, back_populates="${backPop}")`
  })
}

// ============================================================================
// Single-File Model Generation
// ============================================================================

function generateModelBody(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly M2MTableInfo[],
): string | null {
  const idField = model.fields.find((f) => f.isId)
  const compositePkFieldNames = new Set(model.primaryKey?.fields ?? [])
  const isCompositePk = !idField && compositePkFieldNames.size > 0

  if (!(idField || isCompositePk)) return null

  const associations = getAssociations(model, allModels)
  const belongsToFkFields = new Set(associations.belongsTo.map((a) => a.foreignKey))

  const enumMap = new Map<string, readonly string[]>(
    (enums ?? []).map((e) => [e.name, e.values.map((v) => v.name)]),
  )

  const tableName = model.dbName ?? makeSnakeCase(model.name)
  const scalarFields = model.fields.filter((f) => f.kind !== 'object')

  const columnLines = scalarFields.map((field) => {
    const isPk = field.isId || compositePkFieldNames.has(field.name)
    const isFk = belongsToFkFields.has(field.name)
    return generateColumn(field, isPk, isFk, associations, allModels, enumMap)
  })

  const tableArgsLines = generateTableArgs(model, indexes)

  const relationLines = [
    ...generateBelongsToRelationships(associations, model, allModels),
    ...generateHasManyRelationships(associations, model, allModels),
    ...generateHasOneRelationships(associations, model, allModels),
    ...generateManyToManyRelationships(associations, model, allModels, m2mTables),
  ]

  const hasRelations = relationLines.length > 0

  return [
    `class ${model.name}(Base):`,
    `    __tablename__ = "${tableName}"`,
    '',
    ...columnLines,
    ...tableArgsLines,
    ...(hasRelations ? [''] : []),
    ...relationLines,
  ].join('\n')
}

// ============================================================================
// Import Collection (single-file)
// ============================================================================

function collectGlobalImports(
  models: readonly DMMF.Model[],
  _enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly M2MTableInfo[],
): readonly string[] {
  const saImports = new Set<string>()
  const needsOptional = models.some((m) =>
    m.fields.some((f) => f.kind !== 'object' && !f.isRequired),
  )
  const hasRelationship = models.some((m) => m.fields.some((f) => f.kind === 'object'))
  const needsFunc = models.some((m) =>
    m.fields.some(
      (f) =>
        (f.type === 'DateTime' && isFunctionDefault(f.default) && f.default.name === 'now') ||
        f.isUpdatedAt,
    ),
  )
  const needsDecimal = models.some((m) => m.fields.some((f) => f.type === 'Decimal'))
  const needsDatetime = models.some((m) => m.fields.some((f) => f.type === 'DateTime'))
  const needsUuid = models.some((m) =>
    m.fields.some((f) => {
      if (!f.nativeType) return false
      const [n] = f.nativeType as [string, readonly (string | number)[]]
      return n === 'Uuid'
    }),
  )
  const needsDate = models.some((m) =>
    m.fields.some((f) => {
      if (!f.nativeType) return false
      const [n] = f.nativeType as [string, readonly (string | number)[]]
      return n === 'Date'
    }),
  )
  const needsTime = models.some((m) =>
    m.fields.some((f) => {
      if (!f.nativeType) return false
      const [n] = f.nativeType as [string, readonly (string | number)[]]
      return n === 'Time'
    }),
  )

  // Collect SA types that need explicit import
  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind === 'object') continue
      if (field.kind === 'enum') {
        saImports.add('Enum')
        continue
      }
      if (needsExplicitSaType(field)) {
        const resolved = resolveNativeType(field)
        saImports.add(resolved.replace(/\(.*\)$/, ''))
      }
    }

    // ForeignKey from belongsTo
    const associations = getAssociations(model, models)
    if (associations.belongsTo.length > 0) saImports.add('ForeignKey')

    // Composite PK with FK
    const idField = model.fields.find((f) => f.isId)
    if (!idField && (model.primaryKey?.fields ?? []).length > 0) {
      if (associations.belongsTo.length > 0) saImports.add('ForeignKey')
    }

    if (model.uniqueFields.length > 0) saImports.add('UniqueConstraint')

    if (
      indexes.some(
        (idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'),
      )
    ) {
      saImports.add('Index')
    }
  }

  if (m2mTables.length > 0) {
    saImports.add('Column')
    saImports.add('ForeignKey')
    saImports.add('Table')
    for (const info of m2mTables) {
      const leftType = info.leftPkField ? resolveNativeType(info.leftPkField) : 'String'
      const rightType = info.rightPkField ? resolveNativeType(info.rightPkField) : 'String'
      saImports.add(leftType.replace(/\(.*\)$/, ''))
      saImports.add(rightType.replace(/\(.*\)$/, ''))
    }
  }

  if (needsFunc) saImports.add('func')

  const lines: string[] = []

  // sqlalchemy imports
  const sortedSa = [...saImports].sort()
  if (sortedSa.length > 0) {
    lines.push(`from sqlalchemy import ${sortedSa.join(', ')}`)
  }

  // orm imports
  const ormImports = ['DeclarativeBase', 'Mapped', 'mapped_column']
  if (hasRelationship) ormImports.push('relationship')
  lines.push(`from sqlalchemy.orm import ${ormImports.sort().join(', ')}`)

  // typing imports
  if (needsOptional) {
    lines.push('from typing import Optional')
  }

  // stdlib imports
  if (needsDecimal) lines.push('from decimal import Decimal as DecimalType')
  const dtParts: string[] = []
  if (needsDatetime) dtParts.push('datetime')
  if (needsDate) dtParts.push('date')
  if (needsTime) dtParts.push('time as time_type')
  if (dtParts.length > 0) lines.push(`from datetime import ${dtParts.join(', ')}`)
  if (needsUuid) lines.push('import uuid as uuid_mod')

  return lines
}

// ============================================================================
// Public API
// ============================================================================

export function generateSingleFile(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
): string {
  const idx = indexes ?? []
  const m2mTables = collectManyToManyTables(models)

  const importLines = collectGlobalImports(models, enums, idx, m2mTables)

  const m2mLines =
    m2mTables.length > 0
      ? m2mTables.flatMap((t, i) =>
          i === 0 ? ['', generateAssociationTable(t)] : ['', generateAssociationTable(t)],
        )
      : []

  const modelBodies = models
    .map((model) => generateModelBody(model, models, enums, idx, m2mTables))
    .filter((body): body is string => body !== null)

  return [
    ...importLines,
    '',
    '',
    'class Base(DeclarativeBase):',
    '    pass',
    ...m2mLines,
    '',
    '',
    ...modelBodies.join('\n\n').split('\n'),
    '',
  ].join('\n')
}

// Keep for backward compatibility with existing tests
export function sqlalchemySchemas(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
): string {
  return generateSingleFile(allModels ?? models, enums, indexes)
}

// ============================================================================
// File Output
// ============================================================================

export async function writeSQLAlchemyFile(
  models: readonly DMMF.Model[],
  outPath: string,
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  const dir = dirname(outPath)
  const mkdirResult = await mkdir(dir)
  if (!mkdirResult.ok) return mkdirResult

  const code = generateSingleFile(models, enums, indexes)
  const writeResult = await writeFile(outPath, code)
  if (!writeResult.ok) return writeResult
  console.log(`wrote ${outPath}`)

  return { ok: true, value: undefined }
}
