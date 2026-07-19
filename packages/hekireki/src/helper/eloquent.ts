import type { DMMF } from '@prisma/generator-helper'

import { makeSnakeCase, stripAnnotations } from '../utils/index.js'

export function prismaTypeToEloquentCast(type: string) {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'datetime'
  if (type === 'Json') return 'array'
  return null
}

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    ownerKeyColumn: string
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    localKeyColumn: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    localKeyColumn: string
  }[] = []
  const belongsToMany: {
    name: string
    targetModel: string
    joinTable: string
    foreignPivotKey: string
    relatedPivotKey: string
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
        ownerKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
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
        belongsToMany.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignPivotKey: model.name === left ? 'A' : 'B',
          relatedPivotKey: model.name === left ? 'B' : 'A',
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
    const localKeyColumn = fieldColumn(model, fkField?.relationToFields?.[0] ?? 'id')

    if (field.isList) {
      hasMany.push({ name: field.name, targetModel: field.type, foreignKeyColumn, localKeyColumn })
    } else {
      hasOne.push({ name: field.name, targetModel: field.type, foreignKeyColumn, localKeyColumn })
    }
  }

  return { belongsTo, hasMany, hasOne, belongsToMany }
}

function findTimestamps(fields: readonly DMMF.Field[]) {
  const createdAliases = ['created_at', 'createdAt']
  const updatedAliases = ['updated_at', 'updatedAt', 'modified_at', 'modifiedAt']

  const created = fields.find((f) => f.type === 'DateTime' && createdAliases.includes(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt) ??
    fields.find((f) => f.type === 'DateTime' && updatedAliases.includes(f.name))

  const exclude = new Set([created?.name, updated?.name].filter((name) => name !== undefined))

  return {
    createdColumn: created ? (created.dbName ?? created.name) : null,
    updatedColumn: updated ? (updated.dbName ?? updated.name) : null,
    exclude,
  }
}

export function eloquentEnum(enumDef: DMMF.DatamodelEnum, namespace: string) {
  return [
    '<?php',
    '',
    `namespace ${namespace};`,
    '',
    `enum ${enumDef.name}: string`,
    '{',
    ...enumDef.values.map((v) => `    case ${v.name} = '${v.dbName ?? v.name}';`),
    '}',
  ].join('\n')
}

export function eloquentModels(
  models: readonly DMMF.Model[],
  namespace: string,
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const contextModels = allModels ?? models
  const enumNames = new Set((enums ?? []).map((e) => e.name))
  return models
    .map((model) => {
      const associations = getAssociations(model, contextModels)
      const tableName = model.dbName ?? makeSnakeCase(model.name)
      const idField = model.fields.find((f) => f.isId)
      const compositePkFields = model.primaryKey?.fields ?? []
      const timestamps = findTimestamps(model.fields)

      const pkColumn = idField ? (idField.dbName ?? idField.name) : null
      const pkUuidTrait = (() => {
        const def = idField?.default
        if (!(def && typeof def === 'object' && 'name' in def)) return null
        // Laravel 12: HasUuids generates UUIDv7, HasVersion4Uuids generates
        // ordered UUIDv4 (Laravel 11.35+), HasUlids generates ULIDs.
        if (def.name === 'ulid') return 'HasUlids'
        if (def.name !== 'uuid') return null
        return 'args' in def && def.args[0] === 7 ? 'HasUuids' : 'HasVersion4Uuids'
      })()
      const pkDefault = idField?.default
      const isAutoincrement =
        idField !== undefined &&
        (idField.type === 'Int' || idField.type === 'BigInt') &&
        pkDefault !== undefined &&
        pkDefault !== null &&
        typeof pkDefault === 'object' &&
        'name' in pkDefault &&
        pkDefault.name === 'autoincrement'

      const timestampConstLines = [
        ...(timestamps.createdColumn === null && timestamps.updatedColumn !== null
          ? ['    const CREATED_AT = null;']
          : timestamps.createdColumn !== null && timestamps.createdColumn !== 'created_at'
            ? [`    const CREATED_AT = '${timestamps.createdColumn}';`]
            : []),
        ...(timestamps.updatedColumn === null && timestamps.createdColumn !== null
          ? ['    const UPDATED_AT = null;']
          : timestamps.updatedColumn !== null && timestamps.updatedColumn !== 'updated_at'
            ? [`    const UPDATED_AT = '${timestamps.updatedColumn}';`]
            : []),
      ]
      const timestampsDisabled =
        timestamps.createdColumn === null && timestamps.updatedColumn === null

      const attributeFields = model.fields.filter(
        (f) =>
          (f.kind === 'scalar' || f.kind === 'enum') && !f.isId && !timestamps.exclude.has(f.name),
      )

      const fillableLines =
        attributeFields.length > 0
          ? [
              '    protected $fillable = [',
              ...attributeFields.map((f) => `        '${f.dbName ?? f.name}',`),
              '    ];',
            ]
          : []

      const castEntries = attributeFields.flatMap((f) => {
        const column = f.dbName ?? f.name
        // Prisma scalar lists are native arrays (e.g. text[] on PostgreSQL),
        // not serialized JSON: Laravel's 'array' cast would json_decode/encode
        // and break both reads and writes, so lists get no cast.
        if (f.isList) return []
        if (f.kind === 'enum' && enumNames.has(f.type)) {
          return [`        '${column}' => ${f.type}::class,`]
        }
        const cast = prismaTypeToEloquentCast(f.type)
        return cast ? [`        '${column}' => '${cast}',`] : []
      })

      const castLines =
        castEntries.length > 0 ? ['    protected $casts = [', ...castEntries, '    ];'] : []

      const propertyBlocks = [
        ...(pkUuidTrait !== null ? [[`    use ${pkUuidTrait};`]] : []),
        ...(timestampConstLines.length > 0 ? [timestampConstLines] : []),
        [`    protected $table = '${tableName}';`],
        ...(pkColumn !== null && pkColumn !== 'id'
          ? [[`    protected $primaryKey = '${pkColumn}';`]]
          : []),
        ...(idField === undefined && compositePkFields.length > 0
          ? [['    protected $primaryKey = null;']]
          : []),
        ...(idField?.type === 'String' ? [["    protected $keyType = 'string';"]] : []),
        ...((idField !== undefined && !isAutoincrement) ||
        (idField === undefined && compositePkFields.length > 0)
          ? [['    public $incrementing = false;']]
          : []),
        ...(timestampsDisabled ? [['    public $timestamps = false;']] : []),
        ...(fillableLines.length > 0 ? [fillableLines] : []),
        ...(castLines.length > 0 ? [castLines] : []),
      ]

      const belongsToMethods = associations.belongsTo.map((a) => {
        const ownerKeyArg = a.ownerKeyColumn === 'id' ? '' : `, '${a.ownerKeyColumn}'`
        return [
          `    public function ${a.name}(): BelongsTo`,
          '    {',
          `        return $this->belongsTo(${a.targetModel}::class, '${a.foreignKeyColumn}'${ownerKeyArg});`,
          '    }',
        ]
      })

      const hasOneMethods = associations.hasOne.map((a) => {
        const localKeyArg = a.localKeyColumn === 'id' ? '' : `, '${a.localKeyColumn}'`
        return [
          `    public function ${a.name}(): HasOne`,
          '    {',
          `        return $this->hasOne(${a.targetModel}::class, '${a.foreignKeyColumn}'${localKeyArg});`,
          '    }',
        ]
      })

      const hasManyMethods = associations.hasMany.map((a) => {
        const localKeyArg = a.localKeyColumn === 'id' ? '' : `, '${a.localKeyColumn}'`
        return [
          `    public function ${a.name}(): HasMany`,
          '    {',
          `        return $this->hasMany(${a.targetModel}::class, '${a.foreignKeyColumn}'${localKeyArg});`,
          '    }',
        ]
      })

      const belongsToManyMethods = associations.belongsToMany.map((a) => [
        `    public function ${a.name}(): BelongsToMany`,
        '    {',
        `        return $this->belongsToMany(${a.targetModel}::class, '${a.joinTable}', '${a.foreignPivotKey}', '${a.relatedPivotKey}');`,
        '    }',
      ])

      const methodBlocks = [
        ...belongsToMethods,
        ...hasOneMethods,
        ...hasManyMethods,
        ...belongsToManyMethods,
      ]

      const relationImports = [
        ...(associations.belongsTo.length > 0 ? ['BelongsTo'] : []),
        ...(associations.belongsToMany.length > 0 ? ['BelongsToMany'] : []),
        ...(associations.hasMany.length > 0 ? ['HasMany'] : []),
        ...(associations.hasOne.length > 0 ? ['HasOne'] : []),
      ]

      const doc = stripAnnotations(model.documentation)
      const docLines = doc ? ['/**', ...doc.split('\n').map((line) => ` * ${line}`), ' */'] : []

      const bodyBlocks = [...propertyBlocks, ...methodBlocks]

      const lines = [
        '<?php',
        '',
        `namespace ${namespace};`,
        '',
        ...(pkUuidTrait !== null
          ? [`use Illuminate\\Database\\Eloquent\\Concerns\\${pkUuidTrait};`]
          : []),
        'use Illuminate\\Database\\Eloquent\\Model;',
        ...relationImports.map((r) => `use Illuminate\\Database\\Eloquent\\Relations\\${r};`),
        '',
        ...docLines,
        `class ${model.name} extends Model`,
        '{',
        ...bodyBlocks.flatMap((block, i) => (i === 0 ? block : ['', ...block])),
        '}',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
