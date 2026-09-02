import type { DMMF } from '@prisma/generator-helper'
import * as z from 'zod'

import { erKey, mergeERRelations } from '../../../helper/relation.js'
import { isAnnotationLine } from '../../../utils/index.js'

const SchemaFileInput = z
  .object({
    path: z
      .string()
      .meta({ description: 'The file path as Studio loaded it.', example: 'prisma/schema.prisma' }),
    content: z
      .string()
      .meta({ description: 'The whole file content.', example: 'model User {\n  id Int @id\n}\n' }),
  })
  .readonly()
  .meta({ description: 'One schema file on disk' })

const Field = z.custom<DMMF.Field>().meta({ description: 'A DMMF field as Prisma parsed it' })

const Model = z.custom<DMMF.Model>().meta({ description: 'A DMMF model as Prisma parsed it' })

const Index = z.custom<DMMF.Index>().meta({ description: 'A DMMF index as Prisma parsed it' })

const DatamodelEnum = z
  .custom<DMMF.DatamodelEnum>()
  .meta({ description: 'A DMMF enum as Prisma parsed it' })

function quote(value: string) {
  return JSON.stringify(value)
}

const RenderDefaultInput = z
  .object({
    kind: z.custom<DMMF.FieldKind>().meta({ description: 'scalar, object, enum or unsupported.' }),
    default: z
      .custom<DMMF.Field['default']>()
      .optional()
      .meta({ description: 'The @default value, a literal or a function call.' }),
  })
  .readonly()
  .meta({ description: 'The kind and default of a DMMF field' })

const DefaultCall = z
  .object({
    name: z.string().meta({ description: 'The function name.', example: 'now' }),
    args: z
      .array(z.union([z.string(), z.number(), z.boolean()]))
      .meta({ description: 'The literal arguments.', example: [] }),
  })
  .meta({ description: 'A `@default(fn(args))` value as DMMF encodes it' })

const DefaultList = z
  .array(z.union([z.string(), z.number(), z.boolean()]))
  .meta({ description: 'A `@default([...])` list value as DMMF encodes it' })

/** Renders a field default the way it is written in a Prisma schema: `now()`, `"anonymous"`, `VIEWER`. */
export function makeDefaultText(input: z.infer<typeof RenderDefaultInput>) {
  const value = input.default
  if (value === undefined) return null
  const scalar = (item: string | number | boolean) =>
    typeof item === 'string' ? (input.kind === 'enum' ? item : quote(item)) : String(item)
  const result = z.union([DefaultCall, DefaultList]).safeParse(value)
  if (!result.success) return typeof value === 'object' ? JSON.stringify(value) : scalar(value)
  if (Array.isArray(result.data)) return `[${result.data.map(scalar).join(', ')}]`
  const args = result.data.args.map((arg) => (typeof arg === 'string' ? quote(arg) : String(arg)))
  return `${result.data.name}(${args.join(', ')})`
}

const RenderNativeTypeInput = z
  .object({
    nativeType: z
      .custom<DMMF.Field['nativeType']>()
      .meta({ description: 'The @db.* native type name and its arguments.' }),
  })
  .readonly()
  .meta({ description: 'The nativeType tuple of a DMMF field' })

/** Renders `@db.VarChar(64)` from a DMMF native type tuple. */
export function makeNativeTypeAttribute(input: z.infer<typeof RenderNativeTypeInput>) {
  if (!input.nativeType) return null
  const [name, args] = input.nativeType
  return args.length > 0 ? `@db.${name}(${args.join(', ')})` : `@db.${name}`
}

const AutoRelationNameInput = z
  .object({
    a: z.string().meta({ description: 'One model of the relation.', example: 'User' }),
    b: z.string().meta({ description: 'The other model of the relation.', example: 'Post' }),
  })
  .readonly()
  .meta({ description: 'The two model names of a relation', example: { a: 'User', b: 'Post' } })

/** Prisma's implicit relation name: both model names sorted and joined with `To`. */
export function makeRelationName(input: z.infer<typeof AutoRelationNameInput>) {
  return [input.a, input.b].toSorted().join('To')
}

const RenderRelationAttributeInput = z
  .object({
    field: Field,
    modelName: z.string().meta({ description: 'The model the field belongs to.', example: 'Post' }),
  })
  .readonly()
  .meta({ description: 'A DMMF field and the model it belongs to' })

/** Renders `@relation(...)` for an object field, or null when the field carries no relation attribute. */
export function makeRelationAttribute(input: z.infer<typeof RenderRelationAttributeInput>) {
  const { field, modelName } = input
  if (field.kind !== 'object') return null
  const customName =
    field.relationName && field.relationName !== makeRelationName({ a: modelName, b: field.type })
      ? [quote(field.relationName)]
      : []
  const fromFields = field.relationFromFields ?? []
  const toFields = field.relationToFields ?? []
  const fk =
    fromFields.length > 0
      ? [`fields: [${fromFields.join(', ')}]`, `references: [${toFields.join(', ')}]`]
      : []
  const actions = [
    ...(field.relationOnDelete ? [`onDelete: ${field.relationOnDelete}`] : []),
    ...(field.relationOnUpdate ? [`onUpdate: ${field.relationOnUpdate}`] : []),
  ]
  const parts = [...customName, ...fk, ...actions]
  return parts.length > 0 ? `@relation(${parts.join(', ')})` : null
}

const SplitDocumentationInput = z
  .object({
    documentation: z.string().optional().meta({
      description: 'The /// comment above a field or block.',
      example: 'Primary key\n@z.uuid()',
    }),
  })
  .readonly()
  .meta({ description: 'A DMMF doc comment', example: { documentation: 'Primary key\n@z.uuid()' } })

/** Separates hekireki annotations (`@z.uuid()`, `@relation ...`) from the prose of a doc comment. */
export function makeDocumentation(input: z.infer<typeof SplitDocumentationInput>) {
  const lines = (input.documentation ?? '').split('\n')
  const annotations = lines.map((l) => l.trim()).filter((l) => isAnnotationLine(l))
  const prose = lines
    .filter((l) => !isAnnotationLine(l))
    .join('\n')
    .trim()
  return { documentation: prose === '' ? null : prose, annotations }
}

const RenderIndexAttributeInput = z
  .object({ index: Index })
  .readonly()
  .meta({ description: 'A DMMF index' })

/** Renders `@@unique([a, b], name: "x", map: "y")` and friends. */
export function makeIndexAttribute(input: z.infer<typeof RenderIndexAttributeInput>) {
  const { index } = input
  const keyword = { id: '@@id', unique: '@@unique', normal: '@@index', fulltext: '@@fulltext' }[
    index.type
  ]
  const parts = [
    `[${index.fields.map((f) => f.name).join(', ')}]`,
    ...(index.name ? [`name: ${quote(index.name)}`] : []),
    ...(index.dbName ? [`map: ${quote(index.dbName)}`] : []),
  ]
  return `${keyword}(${parts.join(', ')})`
}

/** Maps a DMMF index to the studio contract. */
export function makeIndex(input: z.infer<typeof RenderIndexAttributeInput>) {
  const { index } = input
  return {
    type: index.type,
    name: index.name ?? null,
    dbName: index.dbName ?? null,
    fields: index.fields.map((f) => f.name),
    attribute: makeIndexAttribute(input),
  }
}

const ForeignKeyFieldsInput = z
  .object({ model: Model })
  .readonly()
  .meta({ description: 'A DMMF model' })

/** Names of the scalar fields that back a relation (`@relation(fields: [...])`) on the model. */
export function makeForeignKeyFields(input: z.infer<typeof ForeignKeyFieldsInput>) {
  return new Set(
    input.model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
  )
}

const ToStudioFieldInput = z
  .object({
    field: Field,
    modelName: z.string().meta({ description: 'The model the field belongs to.', example: 'Post' }),
    foreignKeys: z
      .custom<ReadonlySet<string>>()
      .meta({ description: 'The names of the fields that hold a foreign key.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF field with its model name and the model foreign-key field names' })

/** Maps a DMMF field to the studio contract, rendering its attributes as Prisma writes them. */
export function makeField(input: z.infer<typeof ToStudioFieldInput>) {
  const { field, modelName, foreignKeys } = input
  const defaultValue = makeDefaultText({ kind: field.kind, default: field.default })
  const nativeType = makeNativeTypeAttribute({ nativeType: field.nativeType })
  const relationAttribute = makeRelationAttribute({ field, modelName })
  const docs = makeDocumentation({ documentation: field.documentation })
  const attributes = [
    ...(field.isId ? ['@id'] : []),
    ...(field.isUnique ? ['@unique'] : []),
    ...(defaultValue === null ? [] : [`@default(${defaultValue})`]),
    ...(field.isUpdatedAt ? ['@updatedAt'] : []),
    ...(field.dbName ? [`@map(${quote(field.dbName)})`] : []),
    ...(nativeType === null ? [] : [nativeType]),
    ...(relationAttribute === null ? [] : [relationAttribute]),
  ]
  const relation =
    field.kind === 'object' && field.relationName
      ? {
          name: field.relationName,
          fromFields: [...(field.relationFromFields ?? [])],
          toFields: [...(field.relationToFields ?? [])],
          onDelete: field.relationOnDelete ?? null,
          onUpdate: field.relationOnUpdate ?? null,
        }
      : null
  return {
    name: field.name,
    dbName: field.dbName ?? null,
    kind: field.kind,
    type: field.type,
    isList: field.isList,
    isRequired: field.isRequired,
    isId: field.isId,
    isUnique: field.isUnique,
    isUpdatedAt: field.isUpdatedAt ?? false,
    isForeignKey: foreignKeys.has(field.name),
    default: defaultValue,
    nativeType,
    documentation: docs.documentation,
    annotations: docs.annotations,
    relation,
    attributes,
  }
}

const FindBlockLocationInput = z
  .object({
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
    keyword: z.enum(['model', 'enum']).meta({ description: 'The block kind.', example: 'model' }),
    name: z.string().meta({ description: 'The block name.', example: 'User' }),
  })
  .readonly()
  .meta({
    description: 'Schema files and the block to locate',
    example: { files: [], keyword: 'model', name: 'User' },
  })

/** Finds the file and 1-based line where `model Name {` / `enum Name {` is declared. */
export function findBlockLocation(input: z.infer<typeof FindBlockLocationInput>) {
  const escaped = input.name.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`^\\s*${input.keyword}\\s+${escaped}\\s*\\{`, 'u')
  return (
    input.files
      .flatMap((file) => {
        const index = file.content.split('\n').findIndex((line) => pattern.test(line))
        return index === -1 ? [] : [{ file: file.path, line: index + 1 }]
      })
      .at(0) ?? null
  )
}

const ToStudioModelInput = z
  .object({
    model: Model,
    indexes: z.array(Index).readonly().meta({ description: 'Every index of the datamodel.' }),
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF model, the datamodel indexes and the schema files' })

/** Maps a DMMF model to the studio contract, with block-level indexes and `@@` attributes rendered. */
export function makeModel(input: z.infer<typeof ToStudioModelInput>) {
  const { model, indexes, files } = input
  const blockIndexes = indexes
    .filter((i) => i.model === model.name && !i.isDefinedOnField)
    .map((index) => makeIndex({ index }))
  const docs = makeDocumentation({ documentation: model.documentation })
  const foreignKeys = makeForeignKeyFields({ model })
  return {
    name: model.name,
    dbName: model.dbName ?? null,
    documentation: docs.documentation,
    annotations: docs.annotations,
    fields: model.fields.map((field) => makeField({ field, modelName: model.name, foreignKeys })),
    primaryKey: model.primaryKey ? [...model.primaryKey.fields] : null,
    indexes: blockIndexes,
    attributes: [
      ...blockIndexes.map((i) => i.attribute),
      ...(model.dbName ? [`@@map(${quote(model.dbName)})`] : []),
      ...(model.schema ? [`@@schema(${quote(model.schema)})`] : []),
    ],
    location: findBlockLocation({ files, keyword: 'model', name: model.name }),
  }
}

const ToStudioEnumInput = z
  .object({
    value: DatamodelEnum,
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF enum and the schema files' })

/** Maps a DMMF enum to the studio contract. */
export function makeEnum(input: z.infer<typeof ToStudioEnumInput>) {
  const { value, files } = input
  return {
    name: value.name,
    dbName: value.dbName ?? null,
    documentation: makeDocumentation({ documentation: value.documentation }).documentation,
    values: value.values.map((v) => ({ name: v.name, dbName: v.dbName ?? null })),
    location: findBlockLocation({ files, keyword: 'enum', name: value.name }),
  }
}

const ModelsInput = z
  .object({
    models: z.array(Model).readonly().meta({ description: 'Every model of the datamodel.' }),
  })
  .readonly()
  .meta({ description: 'The DMMF models of a datamodel' })

/** Implicit many-to-many relations: both sides are lists without `@relation(fields:)`; emitted once per pair. */
export function makeImplicitManyToManyRelations(input: z.infer<typeof ModelsInput>) {
  const { models } = input
  return models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind === 'object' && f.isList && (f.relationFromFields ?? []).length === 0)
      .flatMap((field) => {
        const other = models.find((m) => m.name === field.type)
        const inverse = other?.fields.find(
          (f) =>
            f.kind === 'object' &&
            f.relationName === field.relationName &&
            f.type === model.name &&
            !(other.name === model.name && f.name === field.name),
        )
        if (!(other && inverse?.isList)) return []
        const key = `${model.name}.${field.name}`
        const otherKey = `${other.name}.${inverse.name}`
        if (key > otherKey) return []
        return [
          {
            id: `${key}<->${otherKey}`,
            name: field.relationName ?? null,
            origin: 'implicit-many-to-many',
            from: { model: model.name, field: field.name, cardinality: 'many' },
            to: { model: other.name, field: inverse.name, cardinality: 'many' },
            onDelete: null,
            onUpdate: null,
          } as const,
        ]
      }),
  )
}

/** Foreign-key and `/// @relation` relations merged with the implicit many-to-many ones. */
export function makeRelations(input: z.infer<typeof ModelsInput>) {
  const { models } = input
  const merged = mergeERRelations(models).map((relation) => {
    const child = models.find((m) => m.name === relation.to.model)
    const fkField = child?.fields.find(
      (f) =>
        f.kind === 'object' &&
        f.type === relation.from.model &&
        (f.relationFromFields ?? []).includes(relation.to.field),
    )
    return {
      id: erKey(relation),
      name: fkField?.relationName ?? null,
      origin: relation.origin,
      from: relation.from,
      to: relation.to,
      onDelete: fkField?.relationOnDelete ?? null,
      onUpdate: fkField?.relationOnUpdate ?? null,
    }
  })
  return [...merged, ...makeImplicitManyToManyRelations(input)]
}

const FilesInput = z
  .object({
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'The schema files' })

/** The `provider` of the first `datasource` block, or null. */
export function detectProvider(input: z.infer<typeof FilesInput>) {
  return (
    input.files
      .flatMap((file) => {
        const block = /datasource\s+\w+\s*\{([^}]*)\}/u.exec(file.content)
        const provider = block?.[1] ? /provider\s*=\s*"([^"]+)"/u.exec(block[1]) : null
        return provider?.[1] ? [provider[1]] : []
      })
      .at(0) ?? null
  )
}

const ToStudioSchemaInput = z
  .object({
    dmmf: z
      .custom<{ readonly datamodel: DMMF.Datamodel }>()
      .meta({ description: 'The document Prisma parsed from the files.' }),
    files: z.array(SchemaFileInput).readonly().meta({ description: 'The loaded schema files.' }),
  })
  .readonly()
  .meta({ description: 'A parsed DMMF document and the files it came from' })

/** The whole studio schema contract from a DMMF document. */
export function makeSchema(input: z.infer<typeof ToStudioSchemaInput>) {
  const { dmmf, files } = input
  const { models, enums, indexes } = dmmf.datamodel
  return {
    files: files.map((f) => ({ path: f.path, content: f.content })),
    provider: detectProvider({ files }),
    models: models.map((model) => makeModel({ model, indexes, files })),
    enums: enums.map((value) => makeEnum({ value, files })),
    relations: makeRelations({ models }),
  }
}
