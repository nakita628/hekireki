import type { DMMF } from '@prisma/generator-helper'

import { pluralize } from '../utils/humanizer.js'
import { makeSnakeCase, stripAnnotations } from '../utils/index.js'
import { implicitJoinTables, isFunctionDefault } from '../utils/prisma-model.js'
import type { YamlValue } from '../utils/yaml.js'

/** A JSON Schema object as OpenAPI 3.1 holds it: a map of keywords to JSON values. */
export type OpenApiSchema = { readonly [keyword: string]: YamlValue }

/** The schema of a column, which always names its type. */
type ColumnSchema = OpenApiSchema & { readonly type: string }

// The three types Atlas's template knows a column by: an integer, a boolean, and a string for
// every other column, a date-time one for a timestamp. A Prisma enum is a string over the values
// the database stores, a list the array of its items.
const SCALAR: { readonly [type: string]: ColumnSchema } = {
  Int: { type: 'integer' },
  BigInt: { type: 'integer' },
  Boolean: { type: 'boolean' },
  DateTime: { type: 'string', format: 'date-time' },
}

function storedEnumValues(enumName: string, enums: readonly DMMF.DatamodelEnum[]) {
  return enums.find((e) => e.name === enumName)?.values.map((v) => v.dbName ?? v.name)
}

/** The schema of one value in the column: its scalar type, or the enum's stored values. */
function itemSchema(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]): ColumnSchema {
  if (field.kind === 'enum') {
    const values = storedEnumValues(field.type, enums)
    return values === undefined ? { type: 'string' } : { type: 'string', enum: values }
  }
  return SCALAR[field.type] ?? { type: 'string' }
}

/**
 * The column's `@default` as the `default` keyword, where it is a literal the schema can show: a
 * number, a boolean, a string, or an enum member by the value the database stores. One the
 * database or the client computes (`autoincrement()`, `now()`, `uuid()`, `dbgenerated(...)`) and
 * a list, Json or Bytes default, which reach the database as an expression, show no value.
 */
function defaultKeyword(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[]): OpenApiSchema {
  const dflt = field.default
  if (!field.hasDefaultValue || dflt === undefined || dflt === null || isFunctionDefault(dflt)) {
    return {}
  }
  if (typeof dflt === 'object' || field.type === 'Json' || field.type === 'Bytes') return {}
  if (field.kind === 'enum' && typeof dflt === 'string') {
    const value = enums.find((e) => e.name === field.type)?.values.find((v) => v.name === dflt)
    return { default: value?.dbName ?? dflt }
  }
  if (field.type === 'BigInt' && typeof dflt === 'string') {
    // DMMF carries a BigInt default as digits. Past 2^53 JSON would round it, so it is left out.
    return Number.isSafeInteger(Number(dflt)) ? { default: Number(dflt) } : {}
  }
  return { default: dflt }
}

/**
 * A column as a property schema, as Atlas's template writes one: its type, `null` beside it when
 * the column is nullable (an optional field, or a list, which Prisma Migrate makes a nullable
 * array column), and its literal default. The prose of the field's `///` comment is its
 * `description`; the lines a validation generator reads (`@z.`, `@v.`, …) are left out.
 *
 * @example
 * ```prisma
 * /// Display name
 * /// @z.string().min(1).max(50)
 * name String? @default("anonymous")
 * ```
 * ```yaml
 * type: [string, "null"]
 * default: anonymous
 * description: Display name
 * ```
 */
export function makeOpenApiColumn(
  field: DMMF.Field,
  enums: readonly DMMF.DatamodelEnum[],
): OpenApiSchema {
  const item = itemSchema(field, enums)
  const shape: ColumnSchema = field.isList ? { type: 'array', items: item } : item
  const description = stripAnnotations(field.documentation)
  return {
    ...shape,
    ...(field.isList || !field.isRequired ? { type: [shape.type, 'null'] } : {}),
    ...defaultKeyword(field, enums),
    ...(description === undefined ? {} : { description }),
  }
}

/** The description Atlas's template gives a table: a `FK` line per foreign key, after the prose. */
function tableDescription(
  prose: string | undefined,
  foreignKeys: readonly string[],
): OpenApiSchema {
  const text = [...(prose === undefined ? [] : [prose]), ...foreignKeys]
  return text.length === 0 ? {} : { description: `${text.join('\n')}\n` }
}

/**
 * A model as the schema of its table: the columns as properties under their database names, the
 * NOT NULL ones in `required`, and as `description` the prose of the model's `///` comment
 * followed by a line per foreign key, as Atlas's template writes one, naming the key as Prisma
 * Migrate does.
 *
 * @example
 * ```yaml
 * type: object
 * properties:
 *   id:
 *     type: integer
 *   author_id:
 *     type: integer
 * required:
 *   - id
 *   - author_id
 * description: |
 *   A post.
 *   FK posts_author_id_fkey: (author_id) -> users
 * ```
 */
export function makeOpenApiTable(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
): OpenApiSchema {
  const table = model.dbName ?? model.name
  const columnName = (fieldName: string) =>
    model.fields.find((f) => f.name === fieldName)?.dbName ?? fieldName
  const columns = model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
  const required = columns.filter((f) => f.isRequired && !f.isList).map((f) => f.dbName ?? f.name)
  const foreignKeys = model.fields
    .filter((f) => f.relationFromFields !== undefined && f.relationFromFields.length > 0)
    .flatMap((f) => {
      const target = models.find((m) => m.name === f.type)
      if (target === undefined) return []
      const from = (f.relationFromFields ?? []).map(columnName)
      return [
        `FK ${table}_${from.join('_')}_fkey: (${from.join(', ')}) -> ${target.dbName ?? target.name}`,
      ]
    })
  return {
    type: 'object',
    properties: Object.fromEntries(
      columns.map((f) => [f.dbName ?? f.name, makeOpenApiColumn(f, enums)]),
    ),
    ...(required.length === 0 ? {} : { required }),
    ...tableDescription(stripAnnotations(model.documentation), foreignKeys),
  }
}

/** The schema of a model's primary key column, which a join table's column takes after. */
function keyType(model: DMMF.Model, enums: readonly DMMF.DatamodelEnum[]) {
  const key = model.fields.find((f) => f.isId)
  return key === undefined ? { type: 'string' } : itemSchema(key, enums)
}

/**
 * The join table of each implicit many-to-many, `_<relationName>`, as Prisma Migrate makes it:
 * columns `A` and `B` of the two sides' key types, both NOT NULL, each a foreign key to its side.
 *
 * @example
 * ```yaml
 * _PostToTag:
 *   type: object
 *   properties:
 *     A:
 *       type: string
 *     B:
 *       type: integer
 *   required:
 *     - A
 *     - B
 *   description: |
 *     FK _PostToTag_A_fkey: (A) -> posts
 *     FK _PostToTag_B_fkey: (B) -> Tag
 * ```
 */
export function makeOpenApiJoinTables(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  return implicitJoinTables(models).flatMap((pair) => {
    const left = models.find((m) => m.name === pair.left)
    const right = models.find((m) => m.name === pair.right)
    if (left === undefined || right === undefined) return []
    const table = `_${pair.relationName}`
    const schema: OpenApiSchema = {
      type: 'object',
      properties: { A: keyType(left, enums), B: keyType(right, enums) },
      required: ['A', 'B'],
      ...tableDescription(undefined, [
        `FK ${table}_A_fkey: (A) -> ${left.dbName ?? left.name}`,
        `FK ${table}_B_fkey: (B) -> ${right.dbName ?? right.name}`,
      ]),
    }
    return [[table, schema] as const]
  })
}

/** The key a row is addressed by: `@id`, or `@@id`, or the first `@@unique`; none for a table without. */
function keyColumns(model: DMMF.Model): readonly DMMF.Field[] {
  const id = model.fields.filter((f) => f.isId)
  if (id.length > 0) return id
  const names = model.primaryKey?.fields ?? model.uniqueFields[0] ?? []
  return names.flatMap((name) => {
    const field = model.fields.find((f) => f.name === name)
    return field === undefined ? [] : [field]
  })
}

/**
 * What a request to make or change a row carries: every column, as the table schema has it. For a
 * `create`, the columns a row cannot do without are required: NOT NULL, no `@default`, not
 * `@updatedAt`. An `update` requires nothing, as a PATCH.
 *
 * @example
 * ```yaml
 * posts_create:
 *   type: object
 *   properties:
 *     id:
 *       type: integer
 *     title:
 *       type: string
 *     published:
 *       type: boolean
 *       default: false
 *   required:
 *     - title
 * ```
 */
export function makeOpenApiInput(
  model: DMMF.Model,
  enums: readonly DMMF.DatamodelEnum[],
  kind: 'create' | 'update',
): OpenApiSchema {
  const columns = model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum')
  const required =
    kind === 'create'
      ? columns
          .filter((f) => f.isRequired && !f.isList && !f.hasDefaultValue && !f.isUpdatedAt)
          .map((f) => f.dbName ?? f.name)
      : []
  return {
    type: 'object',
    properties: Object.fromEntries(
      columns.map((f) => [f.dbName ?? f.name, makeOpenApiColumn(f, enums)]),
    ),
    ...(required.length === 0 ? {} : { required }),
  }
}

/**
 * The CRUD of a model, as path items under the resource name the generator allots it (the model
 * name in plural kebab-case, `order-items`): `GET` and `POST /{resource}` for the rows, and for a
 * model with a key `GET`, `PATCH` and `DELETE /{resource}/{key}`, one path parameter per key field
 * in the key's order, named as the field is. The operations are named for the model, `listOrderItems`,
 * `createOrderItem`, and tagged with it. A `POST` takes `{table}_create` and a `PATCH`
 * `{table}_update`; a row read, made or changed is answered with the table's schema.
 *
 * @example
 * ```yaml
 * /order-items/{id}:
 *   parameters:
 *     - name: id
 *       in: path
 *       required: true
 *       schema:
 *         type: integer
 *   get:
 *     tags:
 *       - OrderItem
 *     summary: Get an order item
 *     operationId: getOrderItem
 *     responses:
 *       "200":
 *         description: The order item.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/order_items"
 *       "404":
 *         description: No order item has this key.
 * ```
 */
export function makeOpenApiPaths(
  model: DMMF.Model,
  enums: readonly DMMF.DatamodelEnum[],
  resource: string,
): readonly (readonly [string, OpenApiSchema])[] {
  const table = model.dbName ?? model.name
  const one = makeSnakeCase(model.name).replaceAll('_', ' ')
  const many = pluralize(makeSnakeCase(model.name)).replaceAll('_', ' ')
  // "an order item", "a user": the article the noun's first sound takes.
  const a = /^[aeiou]/u.test(one) ? `an ${one}` : `a ${one}`
  const collection: OpenApiSchema = {
    get: {
      tags: [model.name],
      summary: `List ${many}`,
      operationId: `list${pluralize(model.name)}`,
      responses: {
        '200': {
          description: `The ${many}.`,
          content: {
            'application/json': {
              schema: { type: 'array', items: { $ref: `#/components/schemas/${table}` } },
            },
          },
        },
      },
    },
    post: {
      tags: [model.name],
      summary: `Create ${a}`,
      operationId: `create${model.name}`,
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${table}_create` } },
        },
      },
      responses: {
        '201': {
          description: `The ${one} made.`,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${table}` } },
          },
        },
      },
    },
  }
  const keys = keyColumns(model)
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
      operationId: `get${model.name}`,
      responses: {
        '200': {
          description: `The ${one}.`,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${table}` } },
          },
        },
        '404': { description: `No ${one} has this key.` },
      },
    },
    patch: {
      tags: [model.name],
      summary: `Update ${a}`,
      operationId: `update${model.name}`,
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: `#/components/schemas/${table}_update` } },
        },
      },
      responses: {
        '200': {
          description: `The ${one} changed.`,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${table}` } },
          },
        },
        '404': { description: `No ${one} has this key.` },
      },
    },
    delete: {
      tags: [model.name],
      summary: `Delete ${a}`,
      operationId: `delete${model.name}`,
      responses: {
        '204': { description: `The ${one} is deleted.` },
        '404': { description: `No ${one} has this key.` },
      },
    },
  }
  return [
    [`/${resource}`, collection],
    [`/${resource}/${keys.map((key) => `{${key.name}}`).join('/')}`, item],
  ]
}
