import type { DMMF } from '@prisma/generator-helper'
import { parseSync } from 'oxc-parser'
import type { Statement, VariableDeclarator } from 'oxc-parser'

import type { OpenApiSchema } from '../helper/openapi.js'
import {
  makeHandlerBodies,
  makeInputSchema,
  makePaths,
  makeRowSchema,
} from '../helper/zod-openapi-hono.js'
import { pluralize } from '../utils/humanizer.js'
import { makeSnakeCase } from '../utils/index.js'
import { allocate } from '../utils/naming.js'
import { toYaml } from '../utils/yaml.js'
import type { YamlValue } from '../utils/yaml.js'

/** The names a model's schemas take: `User`, `UserCreate`, `UserUpdate`, a number added on a clash. */
function schemaNames(models: readonly DMMF.Model[]) {
  const names = allocate(
    models.flatMap((model) => [
      { key: `${model.name}:row`, candidate: model.name },
      { key: `${model.name}:create`, candidate: `${model.name}Create` },
      { key: `${model.name}:update`, candidate: `${model.name}Update` },
    ]),
    [],
    (name) => name.toLowerCase(),
  )
  return (model: DMMF.Model) => ({
    row: names.get(`${model.name}:row`) ?? model.name,
    create: names.get(`${model.name}:create`) ?? `${model.name}Create`,
    update: names.get(`${model.name}:update`) ?? `${model.name}Update`,
  })
}

/** The resource each model's paths are under: its name in plural kebab-case, `order-items`. */
function resourcesOf(models: readonly DMMF.Model[]) {
  const resources = allocate(
    models.map((model) => ({
      key: model.name,
      candidate: pluralize(makeSnakeCase(model.name)).replaceAll('_', '-'),
    })),
    [],
    (name) => name,
  )
  return (model: DMMF.Model) => resources.get(model.name) ?? model.name
}

/** The security scheme of `auth: jwt`: a bearer JWT. */
const BEARER_AUTH = { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }

/** Whether a YAML value is a map, as an operation or a set of responses is. */
function isMap(value: YamlValue | undefined): value is OpenApiSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An operation that asks for the bearer JWT, and says it answers 401 without one. */
function guardedOperation(operation: OpenApiSchema): OpenApiSchema {
  const responses = operation.responses
  return {
    ...operation,
    security: [{ bearerAuth: [] }],
    responses: {
      ...(isMap(responses) ? responses : {}),
      '401': { description: 'No valid bearer token.' },
    },
  }
}

/** A path item with every operation guarded, its `parameters` as they are. */
function guardedItem(item: OpenApiSchema): OpenApiSchema {
  return Object.fromEntries(
    Object.entries(item).map(([key, value]) =>
      key !== 'parameters' && isMap(value) ? [key, guardedOperation(value)] : [key, value],
    ),
  )
}

/**
 * The OpenAPI 3.1 document of the CRUD of every model, shaped as Prisma Client reads and writes
 * the rows: fields under their Prisma names, enums by their members' names, a list never null.
 * Each model's paths are under its name in plural kebab-case (`/order-items`), and its schemas are
 * the row and what a `POST` and a `PATCH` take. With `auth`, every operation asks for a bearer JWT
 * (`bearerAuth`). Hono Takibi turns it into the routes.
 */
export function zodOpenapiHonoDocument(
  datamodel: DMMF.Datamodel,
  config: { readonly title: string; readonly version: string; readonly auth: boolean },
) {
  const { models, enums } = datamodel
  const names = schemaNames(models)
  const resource = resourcesOf(models)
  return {
    openapi: '3.1.0',
    info: { title: config.title, version: config.version },
    paths: Object.fromEntries(
      models
        .flatMap((model) => makePaths(model, enums, resource(model), names(model)))
        .map(([path, item]) => [path, config.auth ? guardedItem(item) : item] as const),
    ),
    components: {
      schemas: Object.fromEntries(
        models.flatMap((model) => {
          const name = names(model)
          return [
            [name.row, makeRowSchema(model, enums)],
            [name.create, makeInputSchema(model, enums, 'create')],
            [name.update, makeInputSchema(model, enums, 'update')],
          ] as const
        }),
      ),
      ...(config.auth ? { securitySchemes: { bearerAuth: BEARER_AUTH } } : {}),
    },
  }
}

/** The document as YAML. */
export function zodOpenapiHonoYaml(
  datamodel: DMMF.Datamodel,
  config: { readonly title: string; readonly version: string; readonly auth: boolean },
) {
  return toYaml(zodOpenapiHonoDocument(datamodel, config), { flow: ['type'] })
}

/** The paths the app guards with `auth`: every model's resource and what is under it. */
export function guardedPaths(datamodel: DMMF.Datamodel) {
  const resource = resourcesOf(datamodel.models)
  return datamodel.models.map((model) => `/${resource(model)}/*`)
}

/** The body of every handler, by the operation id of its route. */
export function handlerBodies(datamodel: DMMF.Datamodel): ReadonlyMap<string, string> {
  return new Map(datamodel.models.flatMap((model) => makeHandlerBodies(model)))
}

/** A file's top-level statements, or none when it does not parse: a file is never patched half-read. */
function statementsOf(code: string): readonly Statement[] {
  const { program, errors } = parseSync('file.ts', code, { lang: 'ts', sourceType: 'module' })
  return errors.length > 0 ? [] : program.body
}

/** The `const` declarators of a statement, exported or not. */
function declaratorsOf(statement: Statement): readonly VariableDeclarator[] {
  const declaration =
    statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
  return declaration?.type === 'VariableDeclaration' ? declaration.declarations : []
}

/** The name an identifier node has, or undefined for any other node. */
function identifierName(node: { readonly type: string } | null | undefined) {
  return node?.type === 'Identifier' && 'name' in node ? String(node.name) : undefined
}

/** The text of a string literal node, or undefined for any other node. */
function stringValue(node: { readonly type: string } | null | undefined) {
  return node?.type === 'Literal' && 'value' in node && typeof node.value === 'string'
    ? node.value
    : undefined
}

/** Whether an import of the file brings in `name`. */
function importsName(statements: readonly Statement[], name: string) {
  return statements.some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      (statement.specifiers ?? []).some((specifier) => specifier.local.name === name),
  )
}

/** `line` added after the last import of the file, or at its top when it has none. */
function addImport(code: string, statements: readonly Statement[], line: string) {
  const last = statements.findLast((statement) => statement.type === 'ImportDeclaration')
  return last === undefined
    ? `${line}\n${code}`
    : `${code.slice(0, last.end)}\n${line}${code.slice(last.end)}`
}

/**
 * The operation id of each route of the routes file Hono Takibi wrote, by the route's name:
 * `export const getUsersIdRoute = createRoute({ operationId: 'getUser', ... })` → `getUser`.
 */
export function routeOperations(routes: string): ReadonlyMap<string, string> {
  return new Map(
    statementsOf(routes)
      .flatMap(declaratorsOf)
      .flatMap((declarator) => {
        const name = identifierName(declarator.id)
        const init = declarator.init
        if (name === undefined || init?.type !== 'CallExpression') return []
        if (identifierName(init.callee) !== 'createRoute') return []
        const options = init.arguments[0]
        if (options?.type !== 'ObjectExpression') return []
        const operationId = options.properties
          .flatMap((property) =>
            property.type === 'Property' && identifierName(property.key) === 'operationId'
              ? [stringValue(property.value)]
              : [],
          )
          .at(0)
        return operationId === undefined ? [] : [[name, operationId] as const]
      }),
  )
}

/** The route a `RouteHandler<typeof route>` annotation names. */
function handledRoute(declarator: VariableDeclarator) {
  const annotation = declarator.id.typeAnnotation?.typeAnnotation
  if (annotation?.type !== 'TSTypeReference') return undefined
  if (identifierName(annotation.typeName) !== 'RouteHandler') return undefined
  const query = annotation.typeArguments?.params[0]
  return query?.type === 'TSTypeQuery' ? identifierName(query.exprName) : undefined
}

/**
 * A handler file Hono Takibi's template wrote, with each `RouteHandler` it left empty filled with
 * the body for the operation id of its route, and `prisma` imported from `prismaImport` when one
 * is filled. A handler is empty when nothing, not even a comment, is between its braces; one with
 * a body, written by a previous run or by hand, is kept as it is, as Hono Takibi keeps it.
 */
export function fillHandlers(
  code: string,
  operations: ReadonlyMap<string, string>,
  bodies: ReadonlyMap<string, string>,
  prismaImport: string,
) {
  const statements = statementsOf(code)
  const fills = statements.flatMap(declaratorsOf).flatMap((declarator) => {
    const route = handledRoute(declarator)
    const init = declarator.init
    if (route === undefined || init?.type !== 'ArrowFunctionExpression') return []
    if (init.body.type !== 'BlockStatement') return []
    if (code.slice(init.body.start + 1, init.body.end - 1).trim() !== '') return []
    const operationId = operations.get(route)
    const body = operationId === undefined ? undefined : bodies.get(operationId)
    return body === undefined ? [] : [{ start: init.start, end: init.end, body }]
  })
  if (fills.length === 0) return code
  // From the last handler to the first, so a fill leaves the positions before it as they are.
  const filled = fills.reduceRight(
    (text, fill) =>
      `${text.slice(0, fill.start)}async (c) => {\n${fill.body}\n}${text.slice(fill.end)}`,
    code,
  )
  return importsName(statements, 'prisma')
    ? filled
    : addImport(filled, statementsOf(filled), `import { prisma } from '${prismaImport}'`)
}

/**
 * The app entry Hono Takibi wrote, with `auth` imported from `./auth` and run on every path of
 * `paths`, `app.use('/users/*', auth)` after the app is made or after the last such line. A path
 * already guarded is left as it is; a file without `new OpenAPIHono()` is left as it is.
 */
export function guardPaths(code: string, paths: readonly string[]) {
  const statements = statementsOf(code)
  const made = statements.findIndex((statement) =>
    declaratorsOf(statement).some(
      (declarator) =>
        declarator.init?.type === 'NewExpression' &&
        identifierName(declarator.init.callee) === 'OpenAPIHono',
    ),
  )
  const appStatement = statements[made]
  const app = appStatement === undefined ? undefined : declaratorsOf(appStatement)[0]
  const appName = app === undefined ? undefined : identifierName(app.id)
  if (appStatement === undefined || appName === undefined) return code
  const guards = statements.filter((statement) => {
    if (statement.type !== 'ExpressionStatement') return false
    const call = statement.expression
    if (call.type !== 'CallExpression' || call.callee.type !== 'MemberExpression') return false
    return (
      identifierName(call.callee.object) === appName &&
      identifierName(call.callee.property) === 'use' &&
      identifierName(call.arguments[1]) === 'auth'
    )
  })
  const guarded = new Set(
    guards.flatMap((statement) =>
      statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression'
        ? [stringValue(statement.expression.arguments[0])]
        : [],
    ),
  )
  const missing = paths.filter((path) => !guarded.has(path))
  if (missing.length === 0) return code
  const at = (guards.at(-1) ?? appStatement).end
  const lines = missing.map((path) => `${appName}.use('${path}', auth)`).join('\n')
  const guardedCode = `${code.slice(0, at)}\n${guards.length === 0 ? '\n' : ''}${lines}${code.slice(at)}`
  return importsName(statements, 'auth')
    ? guardedCode
    : addImport(guardedCode, statementsOf(guardedCode), "import { auth } from './auth'")
}

/**
 * The module the app guards its paths with, written once and the user's to change after: a JWT
 * in `Authorization: Bearer <token>`, signed with HS256 by the secret `JWT_SECRET`, read from the
 * environment of the runtime (`process.env` on Node, the bindings on Workers).
 */
export function authModule() {
  return `import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { jwt } from 'hono/jwt'

/**
 * Lets a request through with a JWT in \`Authorization: Bearer <token>\`, signed with HS256 by the
 * secret \`JWT_SECRET\`, and answers 401 otherwise. A handler reads the token's payload with
 * \`c.get('jwtPayload')\`.
 */
export const auth = createMiddleware(async (c, next) => {
  const { JWT_SECRET } = env<{ JWT_SECRET: string }>(c)
  return jwt({ secret: JWT_SECRET, alg: 'HS256' })(c, next)
})
`
}
