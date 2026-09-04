import type { DMMF } from '@prisma/generator-helper'
import * as z from 'zod'

import { erKey, erRelations } from '../../../helper/relation.js'
import { isAnnotationLine } from '../../../utils/index.js'

const DefaultValue = z
  .union([
    z.string(),
    z.number(),
    z.boolean(),
    z
      .object({
        name: z.string().meta({ description: 'The function name.', example: 'now' }),
        args: z
          .array(z.union([z.string(), z.number()]))
          .readonly()
          .meta({ description: 'The literal arguments.', example: [] }),
      })
      .readonly(),
    z.array(z.union([z.string(), z.number(), z.boolean()])).readonly(),
  ])
  .optional()
  .meta({ description: 'The @default value, a literal or a function call.' })

const NativeType = z
  .tuple([
    z.string().meta({ description: 'The @db.* type name.', example: 'VarChar' }),
    z
      .array(z.string())
      .readonly()
      .meta({ description: 'Its arguments.', example: ['64'] }),
  ])
  .readonly()
  .nullish()
  .meta({ description: 'The @db.* native type name and its arguments.' })

// The part of a DMMF field the renderers read; Prisma's own type is assignable to it.
const Field = z
  .object({
    name: z.string().meta({ description: 'The field name as declared.', example: 'authorId' }),
    dbName: z
      .string()
      .nullish()
      .meta({ description: 'The @map column name, when set.', example: 'author_id' }),
    kind: z
      .enum(['scalar', 'object', 'enum', 'unsupported'])
      .meta({ description: 'What the field holds.', example: 'scalar' }),
    type: z.string().meta({ description: 'The declared type.', example: 'Int' }),
    isList: z.boolean().meta({ description: 'Whether the field is a list.', example: false }),
    isRequired: z.boolean().meta({ description: 'Whether the field is required.', example: true }),
    isId: z.boolean().meta({ description: 'Whether the field is @id.', example: false }),
    isUnique: z.boolean().meta({ description: 'Whether the field is @unique.', example: false }),
    isUpdatedAt: z
      .boolean()
      .optional()
      .meta({ description: 'Whether the field carries @updatedAt.', example: false }),
    documentation: z
      .string()
      .optional()
      .meta({ description: 'The /// comment above the field.', example: 'The author.' }),
    default: DefaultValue,
    nativeType: NativeType,
    relationName: z
      .string()
      .optional()
      .meta({ description: 'The relation this object field belongs to.', example: 'PostToUser' }),
    relationFromFields: z
      .array(z.string())
      .readonly()
      .optional()
      .meta({ description: 'The scalar fields holding the foreign key.', example: ['authorId'] }),
    relationToFields: z
      .array(z.string())
      .readonly()
      .optional()
      .meta({ description: 'The fields they reference.', example: ['id'] }),
    relationOnDelete: z
      .string()
      .optional()
      .meta({ description: 'The @relation(onDelete:) action.', example: 'Cascade' }),
    relationOnUpdate: z
      .string()
      .optional()
      .meta({ description: 'The @relation(onUpdate:) action.', example: 'Cascade' }),
  })
  .readonly()
  .meta({ description: 'A DMMF field as Prisma parsed it' })

// Stays a DMMF model: makeRelations hands it to helper/relation.ts, which is typed on Prisma's own.
const Model = z.custom<DMMF.Model>().meta({ description: 'A DMMF model as Prisma parsed it' })

// The part of a DMMF index the renderers read.
const Index = z
  .object({
    model: z.string().meta({ description: 'The model it is declared on.', example: 'Post' }),
    type: z
      .enum(['id', 'normal', 'unique', 'fulltext'])
      .meta({ description: 'Which block attribute it came from.', example: 'unique' }),
    isDefinedOnField: z
      .boolean()
      .meta({ description: 'Whether it came from a field attribute.', example: false }),
    name: z
      .string()
      .nullish()
      .meta({ description: 'The `name:` argument, when given.', example: 'byEmail' }),
    dbName: z
      .string()
      .nullish()
      .meta({ description: 'The `map:` constraint name, when given.', example: 'post_slug_key' }),
    fields: z
      .array(
        z
          .object({
            name: z.string().meta({ description: 'The field name.', example: 'email' }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The fields the index covers, in order.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF index as Prisma parsed it' })

// The part of a DMMF enum the renderers read.
const DatamodelEnum = z
  .object({
    name: z.string().meta({ description: 'The enum name as declared.', example: 'Role' }),
    dbName: z
      .string()
      .nullish()
      .meta({ description: 'The @@map type name, when set.', example: 'role' }),
    documentation: z
      .string()
      .optional()
      .meta({ description: 'The /// comment above the block.', example: 'Who someone is.' }),
    values: z
      .array(
        z
          .object({
            name: z.string().meta({ description: 'The member name.', example: 'ADMIN' }),
            dbName: z
              .string()
              .nullish()
              .meta({ description: 'The @map stored value, when set.', example: 'admin' }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The members of the enum, in order.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF enum as Prisma parsed it' })

function quote(value: string) {
  return JSON.stringify(value)
}

const MakeDefaultTextInput = z
  .object({
    kind: z
      .enum(['scalar', 'object', 'enum', 'unsupported'])
      .meta({ description: 'What the field holds.', example: 'scalar' }),
    default: DefaultValue,
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
export function makeDefaultText(input: z.infer<typeof MakeDefaultTextInput>) {
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

const MakeNativeTypeAttributeInput = z
  .object({ nativeType: NativeType })
  .readonly()
  .meta({ description: 'The nativeType tuple of a DMMF field' })

/** Renders `@db.VarChar(64)` from a DMMF native type tuple. */
export function makeNativeTypeAttribute(input: z.infer<typeof MakeNativeTypeAttributeInput>) {
  if (!input.nativeType) return null
  const [name, args] = input.nativeType
  return args.length > 0 ? `@db.${name}(${args.join(', ')})` : `@db.${name}`
}

const MakeRelationNameInput = z
  .object({
    a: z.string().meta({ description: 'One model of the relation.', example: 'User' }),
    b: z.string().meta({ description: 'The other model of the relation.', example: 'Post' }),
  })
  .readonly()
  .meta({ description: 'The two model names of a relation', example: { a: 'User', b: 'Post' } })

/** Prisma's implicit relation name: both model names sorted and joined with `To`. */
export function makeRelationName(input: z.infer<typeof MakeRelationNameInput>) {
  return [input.a, input.b].toSorted().join('To')
}

const MakeRelationAttributeInput = z
  .object({
    field: Field,
    modelName: z.string().meta({ description: 'The model the field belongs to.', example: 'Post' }),
  })
  .readonly()
  .meta({ description: 'A DMMF field and the model it belongs to' })

/** Renders `@relation(...)` for an object field, or null when the field carries no relation attribute. */
export function makeRelationAttribute(input: z.infer<typeof MakeRelationAttributeInput>) {
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

const MakeDocumentationInput = z
  .object({
    documentation: z.string().optional().meta({
      description: 'The /// comment above a field or block.',
      example: 'Primary key\n@z.uuid()',
    }),
  })
  .readonly()
  .meta({ description: 'A DMMF doc comment', example: { documentation: 'Primary key\n@z.uuid()' } })

/** Separates hekireki annotations (`@z.uuid()`, `@relation ...`) from the prose of a doc comment. */
export function makeDocumentation(input: z.infer<typeof MakeDocumentationInput>) {
  const lines = (input.documentation ?? '').split('\n')
  const annotations = lines.map((l) => l.trim()).filter((l) => isAnnotationLine(l))
  const prose = lines
    .filter((l) => !isAnnotationLine(l))
    .join('\n')
    .trim()
  return { documentation: prose === '' ? null : prose, annotations }
}

const MakeIndexAttributeInput = z
  .object({ index: Index })
  .readonly()
  .meta({ description: 'A DMMF index' })

/** Renders `@@unique([a, b], name: "x", map: "y")` and friends. */
export function makeIndexAttribute(input: z.infer<typeof MakeIndexAttributeInput>) {
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

const MakeIndexInput = z.object({ index: Index }).readonly().meta({ description: 'A DMMF index' })

/** Maps a DMMF index to the studio contract. */
export function makeIndex(input: z.infer<typeof MakeIndexInput>) {
  const { index } = input
  return {
    type: index.type,
    name: index.name ?? null,
    dbName: index.dbName ?? null,
    fields: index.fields.map((f) => f.name),
    attribute: makeIndexAttribute(input),
  }
}

const MakeForeignKeyFieldsInput = z
  .object({ model: Model })
  .readonly()
  .meta({ description: 'A DMMF model' })

/** Names of the scalar fields that back a relation (`@relation(fields: [...])`) on the model. */
export function makeForeignKeyFields(input: z.infer<typeof MakeForeignKeyFieldsInput>) {
  return new Set(
    input.model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
  )
}

const MakeFieldInput = z
  .object({
    field: Field,
    modelName: z.string().meta({ description: 'The model the field belongs to.', example: 'Post' }),
    foreignKeys: z
      .set(z.string())
      .meta({ description: 'The names of the fields that hold a foreign key.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF field with its model name and the model foreign-key field names' })

/** Maps a DMMF field to the studio contract, rendering its attributes as Prisma writes them. */
export function makeField(input: z.infer<typeof MakeFieldInput>) {
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

const MakeLocationInput = z
  .object({
    blocks: z
      .array(
        z
          .object({
            type: z
              .enum(['model', 'view', 'type', 'enum', 'datasource', 'generator'])
              .meta({ description: 'The block keyword.', example: 'model' }),
            name: z.string().meta({ description: 'The declared name.', example: 'User' }),
            file: z.string().meta({
              description: 'The file as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            line: z
              .number()
              .int()
              .min(1)
              .meta({ description: 'The 1-based line of the block header.', example: 7 }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'Every block of the loaded files, as the language server lists them.' }),
    types: z
      .array(z.enum(['model', 'view', 'type', 'enum', 'datasource', 'generator']))
      .readonly()
      .meta({ description: 'The block kinds that count.', example: ['model', 'view'] }),
    name: z.string().meta({ description: 'The block name.', example: 'User' }),
  })
  .readonly()
  .meta({
    description: 'The outlined blocks and the one to locate',
    example: { blocks: [], types: ['model', 'view'], name: 'User' },
  })

/** The file and 1-based line of the first block of one of the kinds with the name, or null. */
export function makeLocation(input: z.infer<typeof MakeLocationInput>) {
  const block = input.blocks.find((b) => input.types.includes(b.type) && b.name === input.name)
  return block === undefined ? null : { file: block.file, line: block.line }
}

const MakeModelInput = z
  .object({
    model: Model,
    indexes: z.array(Index).readonly().meta({ description: 'Every index of the datamodel.' }),
    blocks: z
      .array(
        z
          .object({
            type: z
              .enum(['model', 'view', 'type', 'enum', 'datasource', 'generator'])
              .meta({ description: 'The block keyword.', example: 'model' }),
            name: z.string().meta({ description: 'The declared name.', example: 'User' }),
            file: z.string().meta({
              description: 'The file as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            line: z
              .number()
              .int()
              .min(1)
              .meta({ description: 'The 1-based line of the block header.', example: 7 }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'Every block of the loaded files, as the language server lists them.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF model, the datamodel indexes and the outlined blocks' })

/** Maps a DMMF model to the studio contract, with block-level indexes and `@@` attributes rendered. */
export function makeModel(input: z.infer<typeof MakeModelInput>) {
  const { model, indexes, blocks } = input
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
    location: makeLocation({ blocks, types: ['model', 'view'], name: model.name }),
  }
}

const MakeEnumInput = z
  .object({
    value: DatamodelEnum,
    blocks: z
      .array(
        z
          .object({
            type: z
              .enum(['model', 'view', 'type', 'enum', 'datasource', 'generator'])
              .meta({ description: 'The block keyword.', example: 'model' }),
            name: z.string().meta({ description: 'The declared name.', example: 'User' }),
            file: z.string().meta({
              description: 'The file as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            line: z
              .number()
              .int()
              .min(1)
              .meta({ description: 'The 1-based line of the block header.', example: 7 }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'Every block of the loaded files, as the language server lists them.' }),
  })
  .readonly()
  .meta({ description: 'A DMMF enum and the outlined blocks' })

/** Maps a DMMF enum to the studio contract. */
export function makeEnum(input: z.infer<typeof MakeEnumInput>) {
  const { value, blocks } = input
  return {
    name: value.name,
    dbName: value.dbName ?? null,
    documentation: makeDocumentation({ documentation: value.documentation }).documentation,
    values: value.values.map((v) => ({ name: v.name, dbName: v.dbName ?? null })),
    location: makeLocation({ blocks, types: ['enum'], name: value.name }),
  }
}

const MakeRelationsInput = z
  .object({
    models: z.array(Model).readonly().meta({ description: 'Every model of the datamodel.' }),
  })
  .readonly()
  .meta({ description: 'The DMMF models of a datamodel' })

/** Foreign-key, `/// @relation` and implicit many-to-many relations in the studio contract. */
export function makeRelations(input: z.infer<typeof MakeRelationsInput>) {
  const { models } = input
  return erRelations(models).map((relation) => {
    const child = models.find((m) => m.name === relation.to.model)
    const fkField = child?.fields.find(
      (f) =>
        f.kind === 'object' &&
        f.type === relation.from.model &&
        (f.relationFromFields ?? []).includes(relation.to.field),
    )
    return {
      id: erKey(relation),
      name: relation.name ?? fkField?.relationName ?? null,
      origin: relation.origin,
      from: relation.from,
      to: relation.to,
      onDelete: fkField?.relationOnDelete ?? null,
      onUpdate: fkField?.relationOnUpdate ?? null,
    }
  })
}

const MakeSchemaInput = z
  .object({
    dmmf: z
      .object({
        datamodel: z
          .object({
            models: z.array(Model).readonly().meta({ description: 'Every model block.' }),
            enums: z.array(DatamodelEnum).readonly().meta({ description: 'Every enum block.' }),
            indexes: z.array(Index).readonly().meta({ description: 'Every index of every model.' }),
          })
          .readonly()
          .meta({ description: 'The blocks Prisma parsed from the files.' }),
      })
      .readonly()
      .meta({ description: 'The document Prisma parsed from the files.' }),
    files: z
      .array(
        z
          .object({
            path: z.string().meta({
              description: 'The file path as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            content: z.string().meta({
              description: 'The whole file content.',
              example: 'model User {\n  id Int @id\n}\n',
            }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The loaded schema files.' }),
    provider: z.string().nullable().meta({
      description: 'The provider of the first datasource, as Prisma read it.',
      example: 'postgresql',
    }),
    blocks: z
      .array(
        z
          .object({
            type: z
              .enum(['model', 'view', 'type', 'enum', 'datasource', 'generator'])
              .meta({ description: 'The block keyword.', example: 'model' }),
            name: z.string().meta({ description: 'The declared name.', example: 'User' }),
            file: z.string().meta({
              description: 'The file as Studio loaded it.',
              example: 'prisma/schema.prisma',
            }),
            line: z
              .number()
              .int()
              .min(1)
              .meta({ description: 'The 1-based line of the block header.', example: 7 }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'Every block of the loaded files, as the language server lists them.' }),
  })
  .readonly()
  .meta({
    description:
      'A parsed DMMF document, the files it came from, the datasource provider and the outlined blocks',
  })

/** The whole studio schema contract from a DMMF document. */
export function makeSchema(input: z.infer<typeof MakeSchemaInput>) {
  const { dmmf, files, provider, blocks } = input
  const { models, enums, indexes } = dmmf.datamodel
  return {
    files: files.map((f) => ({ path: f.path, content: f.content })),
    provider,
    models: models.map((model) => makeModel({ model, indexes, blocks })),
    enums: enums.map((value) => makeEnum({ value, blocks })),
    relations: makeRelations({ models }),
  }
}
