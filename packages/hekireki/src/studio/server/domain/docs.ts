import type { DMMF } from '@prisma/generator-helper'
import * as z from 'zod'

const MakeDocsInput = z
  .object({
    dmmf: z
      .custom<DMMF.Document>()
      .meta({ description: 'The document Prisma parsed: datamodel, client schema and mappings.' }),
  })
  .readonly()
  .meta({ description: 'The DMMF the documentation is built from' })

// Prisma 2.x named some model operations differently (`findOne`, `createOne`, …). Those keys
// are gone from the current ModelMapping type, so they are read off the object with zod.
const LegacyMapping = z
  .object({
    findSingle: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 findUnique.', example: 'findOneUser' }),
    findOne: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 findUnique.', example: 'findOneUser' }),
    createOne: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 create.', example: 'createOneUser' }),
    createSingle: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 create.', example: 'createOneUser' }),
    deleteOne: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 delete.', example: 'deleteOneUser' }),
    deleteSingle: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 delete.', example: 'deleteOneUser' }),
    updateOne: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 update.', example: 'updateOneUser' }),
    updateSingle: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 update.', example: 'updateOneUser' }),
    upsertOne: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 upsert.', example: 'upsertOneUser' }),
    upsertSingle: z
      .string()
      .optional()
      .meta({ description: 'Prisma 2 upsert.', example: 'upsertOneUser' }),
  })
  .meta({ description: 'The legacy operation names a model mapping may still carry' })

const DefaultCall = z
  .object({
    name: z.string().meta({ description: 'The function name.', example: 'now' }),
    args: z.array(z.unknown()).meta({ description: 'The arguments.', example: [] }),
  })
  .meta({ description: 'A `@default(fn(args))` value as DMMF encodes it' })

const FIELD_DIRECTIVES = new Map<string, string>([
  ['isUnique', '@unique'],
  ['isId', '@id'],
  ['hasDefaultValue', '@default'],
  ['isUpdatedAt', '@updatedAt'],
])

const OPERATIONS = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
] as const

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function lowerCase(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function describeOperation(name: (typeof OPERATIONS)[number], singular: string, plural: string) {
  switch (name) {
    case 'create':
      return { description: `Create one ${singular}`, queryType: 'Mutation' as const }
    case 'deleteMany':
      return { description: `Delete zero or more ${singular}`, queryType: 'Mutation' as const }
    case 'delete':
      return { description: `Delete one ${singular}`, queryType: 'Mutation' as const }
    case 'findMany':
      return { description: `Find zero or more ${plural}`, queryType: 'Query' as const }
    case 'findUnique':
      return { description: `Find zero or one ${plural}`, queryType: 'Query' as const }
    case 'findFirst':
      return { description: `Find first ${plural}`, queryType: 'Query' as const }
    case 'update':
      return { description: `Update one ${singular}`, queryType: 'Mutation' as const }
    case 'updateMany':
      return { description: `Update zero or one ${plural}`, queryType: 'Mutation' as const }
    case 'upsert':
      return { description: `Create or update one ${plural}`, queryType: 'Mutation' as const }
    default:
      return name satisfies never
  }
}

function usageOf(
  name: (typeof OPERATIONS)[number],
  singular: string,
  plural: string,
  method: string,
) {
  switch (name) {
    case 'create':
      return `// Create one ${singular}\nconst ${singular} = await ${method}({\n  data: {\n    // ... data to create a ${singular}\n  }\n})`
    case 'deleteMany':
      return `// Delete a few ${plural}\nconst { count } = await ${method}({\n  where: {\n    // ... provide filter here\n  }\n})`
    case 'delete':
      return `// Delete one ${singular}\nconst ${singular} = await ${method}({\n  where: {\n    // ... filter to delete one ${singular}\n  }\n})`
    case 'findMany':
      return `// Get all ${plural}\nconst ${plural} = await ${method}()\n// Get first 10 ${plural}\nconst ${plural} = await ${method}({ take: 10 })`
    case 'findUnique':
    case 'findFirst':
      return `// Get one ${singular}\nconst ${lowerCase(singular)} = await ${method}({\n  where: {\n    // ... provide filter here\n  }\n})`
    case 'update':
      return `// Update one ${singular}\nconst ${lowerCase(singular)} = await ${method}({\n  where: {\n    // ... provide filter here\n  },\n  data: {\n    // ... provide data here\n  }\n})`
    case 'updateMany':
      return `const { count } = await ${method}({\n  where: {\n    // ... provide filter here\n  },\n  data: {\n    // ... provide data here\n  }\n})`
    case 'upsert':
      return `// Update or create a ${singular}\nconst ${lowerCase(singular)} = await ${method}({\n  create: {\n    // ... data to create a ${singular}\n  },\n  update: {\n    // ... in case it already exists, update\n  },\n  where: {\n    // ... the filter for the ${singular} we want to update\n  }\n})`
    default:
      return name satisfies never
  }
}

function defaultText(value: DMMF.Field['default']) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `@default(${value})`
  }
  if (Array.isArray(value)) return `@default([${value.toString()}])`
  const result = DefaultCall.safeParse(value)
  return result.success ? `@default(${result.data.name}(${result.data.args.join(',')}))` : null
}

function fieldDirectives(field: DMMF.Field) {
  return Object.entries(field).flatMap(([key, set]) => {
    const directive = FIELD_DIRECTIVES.get(key)
    if (!set || directive === undefined) return []
    if (key !== 'hasDefaultValue' || field.default === undefined) return [directive]
    const text = defaultText(field.default)
    return text === null ? [] : [text]
  })
}

function fieldType(field: DMMF.Field) {
  const name = field.isRequired || field.isList ? field.type : `${field.type}?`
  return field.isList ? `${name.replace('?', '')}[]` : name
}

function typeRef(ref: DMMF.InputTypeRef | DMMF.OutputTypeRef) {
  return { type: ref.type, isList: ref.isList, location: ref.location }
}

/** The documentation data of a parsed schema: models with their client operations, and the client API types. */
export function makeDocs(input: z.infer<typeof MakeDocsInput>) {
  const { dmmf } = input
  const models = dmmf.datamodel.models.map((model) => {
    const singular = capitalize(model.name)
    const plural = capitalize(singular)
    const mapping = dmmf.mappings.modelOperations.find((m) => m.model === model.name)
    const legacy = LegacyMapping.safeParse(mapping ?? {})
    const names: Record<(typeof OPERATIONS)[number], string | null | undefined> = {
      findUnique: legacy.success
        ? (legacy.data.findSingle ?? legacy.data.findOne ?? mapping?.findUnique)
        : mapping?.findUnique,
      findFirst: mapping?.findFirst,
      findMany: mapping?.findMany,
      create: legacy.success
        ? (legacy.data.createOne ?? legacy.data.createSingle ?? mapping?.create)
        : mapping?.create,
      update: legacy.success
        ? (legacy.data.updateOne ?? legacy.data.updateSingle ?? mapping?.update)
        : mapping?.update,
      updateMany: mapping?.updateMany,
      upsert: legacy.success
        ? (legacy.data.upsertOne ?? legacy.data.upsertSingle ?? mapping?.upsert)
        : mapping?.upsert,
      delete: legacy.success
        ? (legacy.data.deleteOne ?? legacy.data.deleteSingle ?? mapping?.delete)
        : mapping?.delete,
      deleteMany: mapping?.deleteMany,
    }
    return {
      name: model.name,
      documentation: model.documentation ?? null,
      // Same rows as the original page: `@@unique` from uniqueFields, `@@index` from uniqueIndexes.
      directives: [
        ...(model.primaryKey ? [{ name: '@@id', values: [...model.primaryKey.fields] }] : []),
        ...model.uniqueFields.map((fields) => ({ name: '@@unique', values: [...fields] })),
        ...model.uniqueIndexes.map((index) => ({ name: '@@index', values: [...index.fields] })),
      ],
      fields: model.fields.map((field) => ({
        name: field.name,
        type: fieldType(field),
        bareTypeName: field.type,
        kind: field.kind,
        directives: fieldDirectives(field),
        documentation: field.documentation ?? null,
        required: field.isRequired,
      })),
      operations: OPERATIONS.map((name) => {
        const { description, queryType } = describeOperation(name, singular, plural)
        const field = dmmf.schema.outputObjectTypes.prisma
          .find((t) => t.name === queryType)
          ?.fields.find((f) => f.name === names[name])
        return {
          name,
          description,
          usage: usageOf(name, singular, plural, `prisma.${lowerCase(model.name)}.${name}`),
          inputs:
            field?.args.map((arg) => ({
              name: arg.name,
              types: arg.inputTypes.map(typeRef),
              required: arg.isRequired,
            })) ?? null,
          output: {
            type: field ? field.outputType.type : null,
            required: !field?.isNullable,
            list: field?.outputType.isList ?? false,
          },
        }
      }),
    }
  })
  return {
    models,
    inputTypes: (dmmf.schema.inputObjectTypes.prisma ?? []).map((type) => ({
      name: type.name,
      fields: type.fields.map((field) => ({
        name: field.name,
        types: field.inputTypes.map(typeRef),
        nullable: field.isNullable,
      })),
    })),
    outputTypes: [
      ...dmmf.schema.outputObjectTypes.model,
      ...dmmf.schema.outputObjectTypes.prisma.filter(
        (t) => t.name !== 'Query' && t.name !== 'Mutation',
      ),
    ].map((type) => ({
      name: type.name,
      fields: type.fields.map((field) => ({
        name: field.name,
        types: [typeRef(field.outputType)],
        // The original page shows "Nullable: Yes" for non-null output fields; kept as it was.
        nullable: !field.isNullable,
      })),
    })),
    enumTypes: [...(dmmf.schema.enumTypes.model ?? []), ...dmmf.schema.enumTypes.prisma].map(
      (type) => ({ name: type.name, values: [...type.values] }),
    ),
  }
}
