import type { DMMF } from '@prisma/generator-helper'

import { pluralize } from '../utils/humanizer.js'
import { makeSnakeCase, stripAnnotations } from '../utils/index.js'
import type { OpenApiSchema } from './openapi.js'

/** The schema of one value a field holds, as Prisma Client reads it and the JSON answer carries it. */
const SCALAR: { readonly [type: string]: OpenApiSchema & { readonly type?: string } } = {
  String: { type: 'string' },
  Int: { type: 'integer' },
  // A bigint has no JSON form: the handler hands it on as a number.
  BigInt: { type: 'integer' },
  Float: { type: 'number' },
  // Prisma's Decimal is written by its `toJSON`, as a string, and taken as one.
  Decimal: { type: 'string' },
  Boolean: { type: 'boolean' },
  DateTime: { type: 'string', format: 'date-time' },
  // Any JSON value.
  Json: {},
  // The bytes as base64, which the handler encodes and decodes.
  Bytes: { type: 'string', format: 'byte' },
}

/** The fields Prisma Client reads and writes as values: scalars and enums, not relations. */
export function valueFields(model: DMMF.Model) {
  return model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
}

/** The schema of one value of the field: its scalar's, or the enum's members by Prisma's names. */
function itemSchema(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]): OpenApiSchema {
  if (field.kind === 'enum') {
    const values = enums.find((e) => e.name === field.type)?.values.map((v) => v.name)
    return values === undefined ? { type: 'string' } : { type: 'string', enum: values }
  }
  return SCALAR[field.type] ?? { type: 'string' }
}

/**
 * A field as Prisma Client has it: a list as an array (never null, an empty list is `[]`), an
 * optional field with `null` beside its type, and the prose of its `///` comment as `description`.
 */
export function makeFieldSchema(
  field: DMMF.Field,
  enums: readonly DMMF.DatamodelEnum[],
): OpenApiSchema {
  const item = itemSchema(field, enums)
  const shape: OpenApiSchema = field.isList ? { type: 'array', items: item } : item
  const description = stripAnnotations(field.documentation)
  // Json takes `null` already, as any JSON value.
  const nullable: OpenApiSchema =
    !field.isList && !field.isRequired && typeof shape.type === 'string'
      ? { type: [shape.type, 'null'] }
      : {}
  return { ...shape, ...nullable, ...(description === undefined ? {} : { description }) }
}

/** The fields a row is addressed by: `@id`, or `@@id`, or the first `@@unique`; none for a model without. */
export function keyFields(model: DMMF.Model): readonly DMMF.Field[] {
  const id = model.fields.filter((f) => f.isId)
  if (id.length > 0) return id
  const names = model.primaryKey?.fields ?? model.uniqueFields[0] ?? []
  return names.flatMap((name) => {
    const field = model.fields.find((f) => f.name === name)
    return field === undefined ? [] : [field]
  })
}

/**
 * A row as Prisma Client reads it: every value field under its Prisma name, all of them present.
 * The model's `///` comment is its `description`.
 */
export function makeRowSchema(model: DMMF.Model, enums: readonly DMMF.DatamodelEnum[]) {
  const fields = valueFields(model)
  const description = stripAnnotations(model.documentation)
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f.name, makeFieldSchema(f, enums)])),
    ...(fields.length === 0 ? {} : { required: fields.map((f) => f.name) }),
    ...(description === undefined ? {} : { description }),
  }
}

/**
 * What a `POST` or a `PATCH` takes, the `data` of Prisma's unchecked input: the value fields,
 * foreign keys among them. A create requires the fields a row cannot do without (required, not
 * a list, no `@default`, not `@updatedAt`); an update requires nothing and leaves out the key the
 * path names.
 */
export function makeInputSchema(
  model: DMMF.Model,
  enums: readonly DMMF.DatamodelEnum[],
  kind: 'create' | 'update',
) {
  const keys = new Set(keyFields(model).map((f) => f.name))
  const fields = valueFields(model).filter((f) => kind === 'create' || !keys.has(f.name))
  const required =
    kind === 'create'
      ? fields
          .filter((f) => f.isRequired && !f.isList && !f.hasDefaultValue && !f.isUpdatedAt)
          .map((f) => f.name)
      : []
  return {
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f.name, makeFieldSchema(f, enums)])),
    ...(required.length === 0 ? {} : { required }),
  }
}

/** The operations of a model, named for it: `listOrderItems`, `createOrderItem`, … */
export function operationIds(model: DMMF.Model) {
  return {
    list: `list${pluralize(model.name)}`,
    create: `create${model.name}`,
    get: `get${model.name}`,
    update: `update${model.name}`,
    delete: `delete${model.name}`,
  }
}

/** A reference to a schema of the document's components. */
function ref(name: string) {
  return { $ref: `#/components/schemas/${name}` }
}

/** The JSON content of a request or a response. */
function json(schema: OpenApiSchema) {
  return { content: { 'application/json': { schema } } }
}

/**
 * The CRUD of a model as path items under `resource`: `GET` and `POST /{resource}`, and for a
 * model with a key `GET`, `PATCH` and `DELETE /{resource}/{key}`, a path parameter per key
 * field named as the field is. The schemas are the model's (`User`, `UserCreate`, `UserUpdate`).
 */
export function makePaths(
  model: DMMF.Model,
  enums: readonly DMMF.DatamodelEnum[],
  resource: string,
  schemas: { readonly row: string; readonly create: string; readonly update: string },
): readonly (readonly [string, OpenApiSchema])[] {
  const ids = operationIds(model)
  const one = makeSnakeCase(model.name).replaceAll('_', ' ')
  const many = pluralize(makeSnakeCase(model.name)).replaceAll('_', ' ')
  const a = /^[aeiou]/u.test(one) ? `an ${one}` : `a ${one}`
  const notFound = { '404': { description: `No ${one} has this key.` } }
  const collection: OpenApiSchema = {
    get: {
      tags: [model.name],
      summary: `List ${many}`,
      operationId: ids.list,
      responses: {
        '200': {
          description: `The ${many}.`,
          ...json({ type: 'array', items: ref(schemas.row) }),
        },
      },
    },
    post: {
      tags: [model.name],
      summary: `Create ${a}`,
      operationId: ids.create,
      requestBody: { required: true, ...json(ref(schemas.create)) },
      responses: { '201': { description: `The ${one} made.`, ...json(ref(schemas.row)) } },
    },
  }
  const keys = keyFields(model)
  if (keys.length === 0) return [[`/${resource}`, collection]]
  const item: OpenApiSchema = {
    parameters: keys.map((key) => ({
      name: key.name,
      in: 'path',
      required: true,
      schema: itemSchema(key, enums),
    })),
    get: {
      tags: [model.name],
      summary: `Get ${a}`,
      operationId: ids.get,
      responses: {
        '200': { description: `The ${one}.`, ...json(ref(schemas.row)) },
        ...notFound,
      },
    },
    patch: {
      tags: [model.name],
      summary: `Update ${a}`,
      operationId: ids.update,
      requestBody: { required: true, ...json(ref(schemas.update)) },
      responses: {
        '200': { description: `The ${one} changed.`, ...json(ref(schemas.row)) },
        ...notFound,
      },
    },
    delete: {
      tags: [model.name],
      summary: `Delete ${a}`,
      operationId: ids.delete,
      responses: { '204': { description: `The ${one} is deleted.` }, ...notFound },
    },
  }
  return [
    [`/${resource}`, collection],
    [`/${resource}/${keys.map((key) => `{${key.name}}`).join('/')}`, item],
  ]
}

/** How a value of the field leaves Prisma for JSON, where it has no JSON form of its own. */
function encoder(field: DMMF.Field) {
  if (field.type === 'BigInt') return (value: string) => `Number(${value})`
  if (field.type === 'Bytes') return (value: string) => `Buffer.from(${value}).toString('base64')`
  return undefined
}

/** The row as the answer carries it: a bigint as a number, bytes as base64, the rest as it is. */
function encodeRow(model: DMMF.Model, row: string) {
  const entries = valueFields(model).flatMap((field) => {
    const encode = encoder(field)
    if (encode === undefined) return []
    const value = `${row}.${field.name}`
    const expression = field.isList
      ? `${value}.map((value) => ${encode('value')})`
      : field.isRequired
        ? encode(value)
        : `${value} === null ? null : ${encode(value)}`
    return [`${field.name}: ${expression}`]
  })
  return entries.length === 0 ? row : `{ ...${row}, ${entries.join(', ')} }`
}

/** The rows as the answer carries them. */
function encodeRows(model: DMMF.Model, rows: string) {
  const row = encodeRow(model, 'row')
  return row === 'row' ? rows : `${rows}.map((row) => (${row}))`
}

/** The bytes of a base64 string, as Prisma takes a Bytes field. */
function bytes(value: string) {
  return `new Uint8Array(Buffer.from(${value}, 'base64'))`
}

/**
 * How the handler reads the body, always as `const data = c.req.valid('json')`, and the `data`
 * option it hands Prisma: `data` itself, or, where the model has Bytes, `data` with each Bytes
 * field decoded from base64 back into bytes.
 *
 * @example
 * ```ts
 * const data = c.req.valid('json')
 * await prisma.profile.create({
 *   data: { ...data, avatar: data.avatar === undefined ? undefined : data.avatar === null ? null : ... },
 * })
 * ```
 */
function readBody(model: DMMF.Model, kind: 'create' | 'update') {
  const read = `const data = c.req.valid('json')`
  const fields = valueFields(model).filter((field) => field.type === 'Bytes')
  if (fields.length === 0) return { read, data: 'data' }
  const entries = fields.map((field) => {
    const value = `data.${field.name}`
    const decoded = field.isList
      ? `${value}.map((value) => ${bytes('value')})`
      : field.isRequired
        ? bytes(value)
        : `${value} === null ? null : ${bytes(value)}`
    const isPresent = kind === 'create' && field.isRequired && !field.hasDefaultValue
    return `${field.name}: ${isPresent ? decoded : `${value} === undefined ? undefined : ${decoded}`}`
  })
  return { read, data: `data: { ...data, ${entries.join(', ')} }` }
}

/**
 * How the handler reads the key from the path, each field under its own name,
 * `const { orderId, sku } = c.req.valid('param')`, and the `where` that finds the row by it. A key
 * field named as a variable of the handler is taken under another, `{ data: dataKey }`.
 */
function readKey(keys: readonly DMMF.Field[]) {
  const taken = new Set(['c', 'prisma', 'data', 'row', 'rows', 'count'])
  const names = keys.map((key) => {
    const name = taken.has(key.name) ? `${key.name}Key` : key.name
    return name === key.name ? name : `${key.name}: ${name}`
  })
  return {
    read: `const { ${names.join(', ')} } = c.req.valid('param')`,
    where: `{ ${names.join(', ')} }`,
  }
}

/** The model's delegate on the client: `prisma.orderItem`. */
function delegate(model: DMMF.Model) {
  return `prisma.${model.name.charAt(0).toLowerCase()}${model.name.slice(1)}`
}

/**
 * The body of each handler of a model by its operation id, calling Prisma Client as `prisma`. A
 * row is found by its key with `findFirst`, so a composite key needs no compound name, and a
 * `PATCH` or `DELETE` of a key no row has answers 404 rather than throwing.
 */
export function makeHandlerBodies(model: DMMF.Model): readonly (readonly [string, string])[] {
  const ids = operationIds(model)
  const db = delegate(model)
  const create = readBody(model, 'create')
  const update = readBody(model, 'update')
  const collection = [
    [
      ids.list,
      [`const rows = await ${db}.findMany()`, `return c.json(${encodeRows(model, 'rows')}, 200)`],
    ],
    [
      ids.create,
      [
        create.read,
        `const row = await ${db}.create({ ${create.data} })`,
        `return c.json(${encodeRow(model, 'row')}, 201)`,
      ],
    ],
  ] as const
  const keys = keyFields(model)
  if (keys.length === 0) return collection.map(([id, lines]) => [id, lines.join('\n')] as const)
  const key = readKey(keys)
  const where = key.where
  const item = [
    [
      ids.get,
      [
        key.read,
        `const row = await ${db}.findFirst({ where: ${where} })`,
        'if (row === null) return c.body(null, 404)',
        `return c.json(${encodeRow(model, 'row')}, 200)`,
      ],
    ],
    [
      ids.update,
      [
        key.read,
        update.read,
        `const { count } = await ${db}.updateMany({ where: ${where}, ${update.data} })`,
        'if (count === 0) return c.body(null, 404)',
        `const row = await ${db}.findFirstOrThrow({ where: ${where} })`,
        `return c.json(${encodeRow(model, 'row')}, 200)`,
      ],
    ],
    [
      ids.delete,
      [
        key.read,
        `const { count } = await ${db}.deleteMany({ where: ${where} })`,
        'if (count === 0) return c.body(null, 404)',
        'return c.body(null, 204)',
      ],
    ],
  ] as const
  return [...collection, ...item].map(([id, lines]) => [id, lines.join('\n')] as const)
}
