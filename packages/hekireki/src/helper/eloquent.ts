import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, stripAnnotations } from '../utils/index.js'

export function prismaTypeToEloquentCast(type: string) {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'datetime'
  if (type === 'Json') return 'array'
  return null
}

// A PHP single-quoted string: a backslash and a quote are the only characters it escapes.
function phpString(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
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

    // Eloquent has no composite-key relations: emitting one would silently
    // half-join on the first column, so composite FKs produce no relation
    // method (the scalar columns themselves are still generated).
    if (field.relationFromFields && field.relationFromFields.length > 1) continue
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
      // A self relation has both of its fields on this model: the other side is not this one.
      const otherSide = targetModel.fields.find(
        (f) => f !== field && f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        // Prisma's join table holds the model that sorts first in "A". A model related to itself
        // is on both sides: the relation field whose name sorts first reads its own key from "A".
        const ownIsA =
          model.name === field.type ? field.name < otherSide.name : model.name < field.type
        const [left, right] = ownIsA ? [model.name, field.type] : [field.type, model.name]
        belongsToMany.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignPivotKey: ownIsA ? 'A' : 'B',
          relatedPivotKey: ownIsA ? 'B' : 'A',
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
    if ((fkField?.relationFromFields?.length ?? 0) > 1) continue
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
  const createdAliases = new Set(['created_at', 'createdAt'])
  const updatedAliases = new Set(['updated_at', 'updatedAt', 'modified_at', 'modifiedAt'])

  const created = fields.find((f) => f.type === 'DateTime' && createdAliases.has(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt) ??
    fields.find((f) => f.type === 'DateTime' && updatedAliases.has(f.name))

  const exclude = new Set([created?.name, updated?.name].filter((name) => name !== undefined))

  return {
    createdColumn: created ? (created.dbName ?? created.name) : null,
    updatedColumn: updated ? (updated.dbName ?? updated.name) : null,
    exclude,
  }
}

// The raw value Eloquent keeps for a literal @default, or null where the database fills it
// (now(), autoincrement(), dbgenerated()) or Prisma's client makes it (uuid(), cuid(), ulid()).
// Eloquent holds attributes as the database has them, before its casts: a DateTime in its own
// `Y-m-d H:i:s`, UTC; an enum member as its @map value; Json as its text.
function phpDefault(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]) {
  const def = field.default
  if (def === undefined || def === null || field.isList || typeof def === 'object') return null
  if (field.kind === 'enum') {
    const member = enums.find((e) => e.name === field.type)?.values.find((v) => v.name === def)
    return member ? phpString(member.dbName ?? member.name) : null
  }
  if (typeof def === 'boolean') return String(def)
  if (typeof def === 'number') {
    if (field.type === 'Decimal') return phpString(String(def))
    return field.type === 'Float' && Number.isInteger(def) ? `${def}.0` : String(def)
  }
  // DMMF carries BigInt defaults as digit strings and DateTime literals as ISO strings.
  if (field.type === 'BigInt') return def
  if (field.type === 'DateTime') return phpString(def.slice(0, 19).replace('T', ' '))
  if (field.type === 'Bytes') return null
  return phpString(def)
}

export function eloquentEnum(enumDef: DMMF.DatamodelEnum, namespace: string) {
  return [
    '<?php',
    '',
    `namespace ${namespace};`,
    '',
    `enum ${enumDef.name}: string`,
    '{',
    ...enumDef.values.map((v) => `    case ${v.name} = ${phpString(v.dbName ?? v.name)};`),
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
      const tableName = model.dbName ?? model.name
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
            ? [`    const CREATED_AT = ${phpString(timestamps.createdColumn)};`]
            : []),
        ...(timestamps.updatedColumn === null && timestamps.createdColumn !== null
          ? ['    const UPDATED_AT = null;']
          : timestamps.updatedColumn !== null && timestamps.updatedColumn !== 'updated_at'
            ? [`    const UPDATED_AT = ${phpString(timestamps.updatedColumn)};`]
            : []),
      ]
      const timestampsDisabled =
        timestamps.createdColumn === null && timestamps.updatedColumn === null

      const attributeFields = model.fields.filter(
        (f) =>
          (f.kind === 'scalar' || f.kind === 'enum') && !f.isId && !timestamps.exclude.has(f.name),
      )

      // A key nothing generates (cuid(), or no default at all) is the caller's to give, and a
      // `create([...])` drops what is not fillable.
      const keyGiven = pkColumn !== null && pkUuidTrait === null && !isAutoincrement
      const fillableColumns = [
        ...(keyGiven && pkColumn !== null ? [pkColumn] : []),
        ...attributeFields.map((f) => f.dbName ?? f.name),
      ]
      const fillableLines =
        fillableColumns.length > 0
          ? [
              '    protected $fillable = [',
              ...fillableColumns.map((column) => `        ${phpString(column)},`),
              '    ];',
            ]
          : []

      // A new model carries the schema's literal defaults before it is saved, as it will once
      // the database has filled them.
      const defaultEntries = attributeFields.flatMap((f) => {
        const value = phpDefault(f, enums ?? [])
        return value === null ? [] : [`        ${phpString(f.dbName ?? f.name)} => ${value},`]
      })
      const defaultLines =
        defaultEntries.length > 0
          ? ['    protected $attributes = [', ...defaultEntries, '    ];']
          : []

      // Eloquent has no composite key: the first column stands for it, and an update, a delete
      // or a refresh names every column of it, as the row was read.
      const compositeColumns =
        idField === undefined ? compositePkFields.map((name) => fieldColumn(model, name)) : []
      const compositeKeyMethods = ['setKeysForSaveQuery', 'setKeysForSelectQuery'].map((method) => [
        `    protected function ${method}($query)`,
        '    {',
        `        foreach ([${compositeColumns.map(phpString).join(', ')}] as $column) {`,
        "            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));",
        '        }',
        '',
        '        return $query;',
        '    }',
      ])

      const castEntries = attributeFields.flatMap((f) => {
        const column = f.dbName ?? f.name
        // Prisma scalar lists are native arrays (e.g. text[] on PostgreSQL),
        // not serialized JSON: Laravel's 'array' cast would json_decode/encode
        // and break both reads and writes, so lists get no cast.
        if (f.isList) return []
        if (f.kind === 'enum' && enumNames.has(f.type)) {
          return [`        ${phpString(column)} => ${f.type}::class,`]
        }
        const cast = prismaTypeToEloquentCast(f.type)
        return cast ? [`        ${phpString(column)} => '${cast}',`] : []
      })

      const castLines =
        castEntries.length > 0 ? ['    protected $casts = [', ...castEntries, '    ];'] : []

      const propertyBlocks = [
        ...(pkUuidTrait !== null ? [[`    use ${pkUuidTrait};`]] : []),
        ...(timestampConstLines.length > 0 ? [timestampConstLines] : []),
        [`    protected $table = ${phpString(tableName)};`],
        ...(pkColumn !== null && pkColumn !== 'id'
          ? [[`    protected $primaryKey = ${phpString(pkColumn)};`]]
          : []),
        ...(compositeColumns.length > 0
          ? [[`    protected $primaryKey = ${phpString(compositeColumns[0] ?? '')};`]]
          : []),
        ...(idField?.type === 'String' ? [["    protected $keyType = 'string';"]] : []),
        ...((idField !== undefined && !isAutoincrement) ||
        (idField === undefined && compositePkFields.length > 0)
          ? [['    public $incrementing = false;']]
          : []),
        ...(timestampsDisabled ? [['    public $timestamps = false;']] : []),
        ...(fillableLines.length > 0 ? [fillableLines] : []),
        ...(defaultLines.length > 0 ? [defaultLines] : []),
        ...(castLines.length > 0 ? [castLines] : []),
      ]

      const belongsToMethods = associations.belongsTo.map((a) => {
        const ownerKeyArg = a.ownerKeyColumn === 'id' ? '' : `, ${phpString(a.ownerKeyColumn)}`
        return [
          `    public function ${a.name}(): BelongsTo`,
          '    {',
          `        return $this->belongsTo(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${ownerKeyArg});`,
          '    }',
        ]
      })

      const hasOneMethods = associations.hasOne.map((a) => {
        const localKeyArg = a.localKeyColumn === 'id' ? '' : `, ${phpString(a.localKeyColumn)}`
        return [
          `    public function ${a.name}(): HasOne`,
          '    {',
          `        return $this->hasOne(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
          '    }',
        ]
      })

      const hasManyMethods = associations.hasMany.map((a) => {
        const localKeyArg = a.localKeyColumn === 'id' ? '' : `, ${phpString(a.localKeyColumn)}`
        return [
          `    public function ${a.name}(): HasMany`,
          '    {',
          `        return $this->hasMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
          '    }',
        ]
      })

      const belongsToManyMethods = associations.belongsToMany.map((a) => [
        `    public function ${a.name}(): BelongsToMany`,
        '    {',
        `        return $this->belongsToMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.joinTable)}, '${a.foreignPivotKey}', '${a.relatedPivotKey}');`,
        '    }',
      ])

      // Prisma Client writes a ULID in upper case, and HasUlids in lower: the same column would
      // hold both, and SQLite compares text by case.
      const ulidMethod = [
        '    public function newUniqueId()',
        '    {',
        '        return (string) Str::ulid();',
        '    }',
      ]
      const methodBlocks = [
        ...(pkUuidTrait === 'HasUlids' ? [ulidMethod] : []),
        ...(compositeColumns.length > 0 ? compositeKeyMethods : []),
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
      // A `*/` in the text would end the docblock: it is written `*\/`.
      const docLines = doc
        ? ['/**', ...doc.split('\n').map((line) => ` * ${line.replaceAll('*/', '*\\/')}`), ' */']
        : []

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
        ...(pkUuidTrait === 'HasUlids' ? ['use Illuminate\\Support\\Str;'] : []),
        '',
        ...docLines,
        `class ${makePascalCase(model.name)} extends Model`,
        '{',
        // oxlint-disable-next-line oxc/no-map-spread -- one blank separator per block, not an accumulator
        ...bodyBlocks.flatMap((block, i) => (i === 0 ? block : ['', ...block])),
        '}',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
