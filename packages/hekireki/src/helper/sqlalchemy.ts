import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase } from '../utils/index.js'

const PRISMA_TO_PYTHON: { [k: string]: string } = {
  String: 'str',
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'datetime',
  // Bare `dict` is `dict[Unknown, Unknown]` under mypy --strict; a JSON column is
  // an object with string keys and arbitrary values.
  Json: 'dict[str, Any]',
  Bytes: 'bytes',
}

const PRISMA_TO_SQLALCHEMY: { [k: string]: string } = {
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

export function prismaTypeToSQLAlchemyType(type: string) {
  return PRISMA_TO_SQLALCHEMY[type] ?? 'String'
}

export function prismaTypeToPythonType(type: string) {
  return PRISMA_TO_PYTHON[type] ?? 'str'
}

// Python hard keywords cannot be attribute names (`async`/`yield` etc. are a
// syntax error). Soft keywords (match/case/type/_) are valid names and excluded.
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

// A keyword column name is mapped to a `<name>_` attribute; the real column is
// then preserved via the first positional argument to mapped_column.
export function pythonAttrName(columnName: string) {
  return PYTHON_KEYWORDS.has(columnName) ? `${columnName}_` : columnName
}

function resolveNativeType(field: DMMF.Field) {
  const baseType = prismaTypeToSQLAlchemyType(field.type)
  if (!field.nativeType) return baseType

  const [nativeName, nativeArgs] = field.nativeType
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

function needsExplicitSaType(field: DMMF.Field) {
  if (field.kind === 'enum') return true
  if (field.nativeType) {
    const resolved = resolveNativeType(field)
    if (resolved !== prismaTypeToSQLAlchemyType(field.type)) return true
  }
  return false
}

function pythonTypeForNative(field: DMMF.Field) {
  if (!field.nativeType) {
    const raw = prismaTypeToPythonType(field.type)
    return raw === 'Decimal' ? 'DecimalType' : raw
  }
  const [nativeName] = field.nativeType
  if (nativeName === 'Uuid') return 'uuid_mod.UUID'
  if (nativeName === 'Date') return 'date'
  if (nativeName === 'Time') return 'time_type'
  const raw = prismaTypeToPythonType(field.type)
  return raw === 'Decimal' ? 'DecimalType' : raw
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKey: string
    references: string
  }[] = []
  const hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[] = []
  const hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[] = []
  const manyToMany: { name: string; targetModel: string; relationName: string }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKey: field.relationFromFields[0],
        references: field.relationToFields?.[0] ?? 'id',
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
        manyToMany.push({
          name: field.name,
          targetModel: field.type,
          relationName: field.relationName ?? `${model.name}To${field.type}`,
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

    if (field.isList) {
      hasMany.push({ name: field.name, targetModel: field.type, foreignKey, isList: true })
    } else {
      hasOne.push({ name: field.name, targetModel: field.type, foreignKey, isList: false })
    }
  }

  return { belongsTo, hasMany, hasOne, manyToMany }
}

export function collectManyToManyTables(allModels: readonly DMMF.Model[]) {
  const candidates = allModels.flatMap((model) =>
    model.fields.flatMap((field) => {
      if (field.kind !== 'object' || !field.isList) return []
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) return []
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (!otherSide?.isList) return []

      const [leftName, rightName] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]
      const leftModelObj = allModels.find((m) => m.name === leftName)
      const rightModelObj = allModels.find((m) => m.name === rightName)

      return [
        {
          relationName: field.relationName ?? `${model.name}To${field.type}`,
          info: {
            tableName: `_${leftName}To${rightName}`,
            varName: `${makeSnakeCase(leftName)}_to_${makeSnakeCase(rightName)}`,
            leftModel: leftName,
            leftTable: leftModelObj?.dbName ?? makeSnakeCase(leftName),
            leftPkField: leftModelObj?.fields.find((f) => f.isId),
            rightModel: rightName,
            rightTable: rightModelObj?.dbName ?? makeSnakeCase(rightName),
            rightPkField: rightModelObj?.fields.find((f) => f.isId),
          },
        },
      ]
    }),
  )

  const seen = new Set<string>()
  return candidates.flatMap(({ relationName, info }) => {
    if (seen.has(relationName)) return []
    seen.add(relationName)
    return [info]
  })
}

export function generateAssociationTable(info: {
  tableName: string
  varName: string
  leftModel: string
  leftTable: string
  leftPkField: DMMF.Field | undefined
  rightModel: string
  rightTable: string
  rightPkField: DMMF.Field | undefined
}) {
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

function formatDefault(def: DMMF.Field['default']) {
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

function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function uuidDefaultVersion(field: DMMF.Field) {
  if (!(isFunctionDefault(field.default) && field.default.name === 'uuid')) return null
  return field.default.args[0] === 7 ? 7 : 4
}

function needsForeignKeysParam(
  targetModel: string,
  assocs: readonly { readonly targetModel: string }[],
) {
  return assocs.filter((a) => a.targetModel === targetModel).length > 1
}

function findBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  foreignKey: string,
  allModels: readonly DMMF.Model[],
  sourceFieldName?: string,
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  const sourceModel = allModels.find((m) => m.name === sourceModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  // Prisma pairs the two sides of a relation by relationName; matching on it is
  // the disambiguator (it also handles multiple relations between the same two
  // models). Exclude the source field itself so a self-relation pairs its two
  // ends (parent↔children) instead of back-populating onto itself.
  const sourceField = sourceModel?.fields.find(
    (f) => f.kind === 'object' && f.name === sourceFieldName,
  )
  const relationName = sourceField?.relationName

  const backField = targetModel.fields.find((f) => {
    if (f.kind !== 'object') return false
    if (f.type !== sourceModelName) return false
    if (targetModelName === sourceModelName && f.name === sourceFieldName) return false
    if (relationName !== undefined) return f.relationName === relationName
    if (f.relationFromFields?.includes(foreignKey)) return true
    return sourceModel
      ? sourceModel.fields.some(
          (sf) => sf.relationName === f.relationName && sf.relationFromFields?.includes(foreignKey),
        )
      : false
  })

  return backField ? makeSnakeCase(backField.name) : makeSnakeCase(sourceModelName)
}

function findM2MBackPopulates(
  targetModelName: string,
  sourceModelName: string,
  relationName: string,
  allModels: readonly DMMF.Model[],
) {
  const targetModel = allModels.find((m) => m.name === targetModelName)
  if (!targetModel) return makeSnakeCase(sourceModelName)

  const backField = targetModel.fields.find(
    (f) => f.kind === 'object' && f.type === sourceModelName && f.relationName === relationName,
  )
  return backField ? makeSnakeCase(backField.name) : makeSnakeCase(sourceModelName)
}

function generateColumn(
  field: DMMF.Field,
  isPk: boolean,
  isFk: boolean,
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
  allModels: readonly DMMF.Model[],
  enumMap: ReadonlyMap<string, readonly string[]>,
) {
  const columnName = field.dbName ?? makeSnakeCase(field.name)
  const attrName = pythonAttrName(columnName)
  const elemPythonType = field.kind === 'enum' ? 'str' : pythonTypeForNative(field)
  // A scalar list is a collection; collapsing it to its element type silently
  // drops the array. Lists are non-Optional (an empty array, not None).
  const pythonType = field.isList ? `list[${elemPythonType}]` : elemPythonType
  const typeHint = field.isList || field.isRequired ? pythonType : `Optional[${pythonType}]`

  const colArgs: string[] = []

  // Keyword column renamed to `<name>_`: pin the real column name positionally.
  if (attrName !== columnName) {
    colArgs.push(`"${columnName}"`)
  }

  if (field.kind === 'enum') {
    const values = enumMap.get(field.type)
    const valuesStr = values ? values.map((v) => `"${v}"`).join(', ') : ''
    const enumType = `Enum(${valuesStr}, name="${makeSnakeCase(field.type)}")`
    colArgs.push(field.isList ? `ARRAY(${enumType})` : enumType)
  } else if (field.isList) {
    colArgs.push(`ARRAY(${prismaTypeToSQLAlchemyType(field.type)})`)
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

  const uuidVersion = uuidDefaultVersion(field)
  if (
    field.type === 'DateTime' &&
    isFunctionDefault(field.default) &&
    field.default.name === 'now'
  ) {
    colArgs.push('server_default=func.now()')
  } else if (uuidVersion !== null) {
    // uuid6.uuid7 covers Python < 3.14 (stdlib uuid gains uuid7 in 3.14).
    const isNativeUuid = field.nativeType?.[0] === 'Uuid'
    colArgs.push(
      isNativeUuid
        ? uuidVersion === 7
          ? 'default=uuid6.uuid7'
          : 'default=uuid_mod.uuid4'
        : uuidVersion === 7
          ? 'default=lambda: str(uuid6.uuid7())'
          : 'default=lambda: str(uuid_mod.uuid4())',
    )
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
    return `    ${attrName}: Mapped[${typeHint}]`
  }

  return `    ${attrName}: Mapped[${typeHint}] = mapped_column(${colArgs.join(', ')})`
}

function generateTableArgs(model: DMMF.Model, indexes: readonly DMMF.Index[]) {
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

function generateBelongsToRelationships(
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.belongsTo.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const fkFieldObj = model.fields.find((f) => f.name === assoc.foreignKey)
    const snakeFk = fkFieldObj?.dbName ?? makeSnakeCase(assoc.foreignKey)
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
    const needsFkParam = needsForeignKeysParam(assoc.targetModel, associations.belongsTo)
    const fkClause = needsFkParam ? `foreign_keys=[${snakeFk}], ` : ''
    // A self-referential many-to-one needs remote_side (the PK side) so the ORM
    // can tell which end is "one"; without it mapper configuration fails.
    const pkField = model.fields.find((f) => f.isId)
    const remoteClause =
      assoc.targetModel === model.name && pkField
        ? `remote_side=[${pkField.dbName ?? makeSnakeCase(pkField.name)}], `
        : ''
    return `    ${snakeName}: Mapped["${assoc.targetModel}"] = relationship(${remoteClause}${fkClause}back_populates="${backPop}")`
  })
}

function generateHasManyRelationships(
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.hasMany.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
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
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  return associations.hasOne.map((assoc) => {
    const snakeName = makeSnakeCase(assoc.name)
    const backPop = findBackPopulates(
      assoc.targetModel,
      model.name,
      assoc.foreignKey,
      allModels,
      assoc.name,
    )
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
  associations: {
    belongsTo: { name: string; targetModel: string; foreignKey: string; references: string }[]
    hasMany: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    hasOne: { name: string; targetModel: string; foreignKey: string; isList: boolean }[]
    manyToMany: { name: string; targetModel: string; relationName: string }[]
  },
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  m2mTables: readonly {
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
) {
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

export function generateModelBody(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly {
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
) {
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

export function collectGlobalImports(
  models: readonly DMMF.Model[],
  _enums: readonly DMMF.DatamodelEnum[] | undefined,
  indexes: readonly DMMF.Index[],
  m2mTables: readonly {
    tableName: string
    varName: string
    leftModel: string
    leftTable: string
    leftPkField: DMMF.Field | undefined
    rightModel: string
    rightTable: string
    rightPkField: DMMF.Field | undefined
  }[],
) {
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
  const needsAny = models.some((m) => m.fields.some((f) => f.type === 'Json'))
  const needsArray = models.some((m) => m.fields.some((f) => f.kind !== 'object' && f.isList))
  const needsDecimal = models.some((m) => m.fields.some((f) => f.type === 'Decimal'))
  const needsDatetime = models.some((m) => m.fields.some((f) => f.type === 'DateTime'))
  const needsUuid = models.some((m) =>
    m.fields.some((f) => {
      if (uuidDefaultVersion(f) === 4) return true
      if (!f.nativeType) return false
      const [n] = f.nativeType as [string, readonly (string | number)[]]
      return n === 'Uuid'
    }),
  )
  const needsUuid7 = models.some((m) => m.fields.some((f) => uuidDefaultVersion(f) === 7))
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
      // A scalar list wraps its element SA type in ARRAY(...), so that element
      // type needs importing too (e.g. ARRAY(String) needs String).
      if (field.isList) {
        saImports.add(prismaTypeToSQLAlchemyType(field.type))
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
  if (needsArray) saImports.add('ARRAY')

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
  const typingImports = [needsAny ? 'Any' : null, needsOptional ? 'Optional' : null].filter(
    (i) => i !== null,
  )
  if (typingImports.length > 0) {
    lines.push(`from typing import ${typingImports.join(', ')}`)
  }

  // stdlib imports
  if (needsDecimal) lines.push('from decimal import Decimal as DecimalType')
  const dtParts: string[] = []
  if (needsDatetime) dtParts.push('datetime')
  if (needsDate) dtParts.push('date')
  if (needsTime) dtParts.push('time as time_type')
  if (dtParts.length > 0) lines.push(`from datetime import ${dtParts.join(', ')}`)
  if (needsUuid) lines.push('import uuid as uuid_mod')
  if (needsUuid7) lines.push('import uuid6')

  return lines
}
