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
import type { AuthKind } from '../types/index.js'
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

/** An operation that asks for the bearer JWT, and says it answers 401 without one, 403 without a role. */
function guardedOperation(operation: OpenApiSchema): OpenApiSchema {
  const responses = operation.responses
  return {
    ...operation,
    security: [{ bearerAuth: [] }],
    responses: {
      ...(isMap(responses) ? responses : {}),
      '401': { description: 'No valid bearer token.' },
      '403': { description: 'The token holds none of the roles the API asks for.' },
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
 * The claims both modules check after the signature, read from `c.get('jwtPayload')` (unknown
 * until read): `exp` and `iat`, which hono/jwt checks only when a token has them, and the roles
 * the token must hold one of (`REQUIRED_ROLES`, `['admin']` until the user says otherwise).
 */
const CLAIM_CHECKS = `/** A claim of the token's payload when it is a number, and undefined otherwise. */
function numberClaim(payload: unknown, name: string) {
  if (typeof payload !== 'object' || payload === null) return undefined
  const value: unknown = Reflect.get(payload, name)
  return typeof value === 'number' ? value : undefined
}

/** The 401 a token is refused with when it lacks a claim it must have. */
function unauthorized(description: string) {
  return new HTTPException(401, {
    res: new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer error="invalid_token",error_description="' + description + '"',
      },
    }),
  })
}

/** The claim of the token that holds the roles of its user: a string, or an array of strings. */
const ROLE_CLAIM = 'role'

/**
 * The roles of which a token must hold one to reach the API, answered 403 otherwise. The API
 * writes every model, so only an admin reaches it until this says who else may; an empty list
 * lets any valid token through.
 */
const REQUIRED_ROLES: readonly string[] = ['admin']

/** The roles the token's payload holds under ROLE_CLAIM. */
function rolesOf(payload: unknown): readonly string[] {
  if (typeof payload !== 'object' || payload === null) return []
  const value: unknown = Reflect.get(payload, ROLE_CLAIM)
  if (typeof value === 'string') return [value]
  return Array.isArray(value) ? value.filter((role) => typeof role === 'string') : []
}

/** Whether the token holds one of REQUIRED_ROLES, or none is asked for. */
function hasRequiredRole(payload: unknown) {
  if (REQUIRED_ROLES.length === 0) return true
  return rolesOf(payload).some((role) => REQUIRED_ROLES.includes(role))
}

/** The 403 a valid token is refused with when it lacks every role REQUIRED_ROLES names. */
function forbidden() {
  return new HTTPException(403, { res: new Response('Forbidden', { status: 403 }) })
}`

/**
 * `auth = "jwt"`: a JWT signed with HS256 by `JWT_SECRET`, from the issuer `JWT_ISSUER` for the
 * audience `JWT_AUDIENCE`, that has an `exp` at most an hour after its `iat`. hono/jwt checks
 * `exp` and `iat` only when a token has them, so a token without them, which would never expire,
 * is refused here. A missing variable or a secret shorter than 32 bytes fails every request.
 */
function jwtAuthModule() {
  return `import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { jwt } from 'hono/jwt'

/** The longest a token may live, from its \`iat\` to its \`exp\`: one issued for longer is refused. */
const MAX_TOKEN_LIFETIME_SECONDS = 60 * 60

/** The fewest bytes \`JWT_SECRET\` may have: HS256 takes a key no shorter than its 32-byte hash. */
const MIN_SECRET_BYTES = 32

${CLAIM_CHECKS}

/**
 * Lets a request through with a JWT in \`Authorization: Bearer <token>\`, signed with HS256 by the
 * secret \`JWT_SECRET\`, issued by \`JWT_ISSUER\` for \`JWT_AUDIENCE\`, with an \`exp\` at most
 * MAX_TOKEN_LIFETIME_SECONDS after its \`iat\`, and answers 401 otherwise; a token without one of
 * REQUIRED_ROLES is answered 403. The variables are read
 * from the environment of the runtime (\`process.env\` on Node, the bindings on Workers). Without
 * one of them, or with a secret shorter than MIN_SECRET_BYTES, every request fails with 500: the
 * app never runs unguarded. A handler reads the token's payload with \`c.get('jwtPayload')\`.
 */
export const auth = createMiddleware(async (c, next) => {
  const { JWT_SECRET, JWT_ISSUER, JWT_AUDIENCE } = env<{
    JWT_SECRET?: string
    JWT_ISSUER?: string
    JWT_AUDIENCE?: string
  }>(c)
  if (!JWT_SECRET || new TextEncoder().encode(JWT_SECRET).length < MIN_SECRET_BYTES) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 bytes')
  }
  if (!JWT_ISSUER || !JWT_AUDIENCE) throw new Error('JWT_ISSUER and JWT_AUDIENCE must be set')
  const verify = jwt({
    secret: JWT_SECRET,
    alg: 'HS256',
    verification: { iss: JWT_ISSUER, aud: JWT_AUDIENCE },
  })
  return verify(c, async () => {
    // hono/jwt checks exp and iat only when the token has them: one without either never expires.
    const payload = c.get('jwtPayload')
    const exp = numberClaim(payload, 'exp')
    const iat = numberClaim(payload, 'iat')
    if (exp === undefined || iat === undefined) throw unauthorized('token without exp or iat')
    if (exp - iat > MAX_TOKEN_LIFETIME_SECONDS) throw unauthorized('token lives too long')
    if (!hasRequiredRole(payload)) throw forbidden()
    await next()
  })
})
`
}

/**
 * `auth = "jwks"`: a JWT signed with an asymmetric key that the issuer publishes at `JWKS_URI`
 * (an identity provider: Auth0, Clerk, Okta), from `JWT_ISSUER` for `JWT_AUDIENCE`,
 * that has an `exp`. The app holds no secret that signs a token. The keys are cached for ten
 * minutes and fetched again for a `kid` they lack, at most once a minute.
 */
function jwksAuthModule() {
  return `import { env } from 'hono/adapter'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { jwk } from 'hono/jwk'
import { decode } from 'hono/jwt'
import type { HonoJsonWebKey } from 'hono/utils/jwt/jws'

/** How long the keys fetched from \`JWKS_URI\` are used before they are fetched again. */
const JWKS_CACHE_SECONDS = 10 * 60

/** The least time between two fetches for a \`kid\` the cache lacks: no token hammers the issuer. */
const JWKS_REFETCH_SECONDS = 60

/** The algorithms a token may be signed with: asymmetric only, so no key here signs one. */
const ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'] as const

let cache: { uri: string; keys: HonoJsonWebKey[]; fetchedAt: number } | undefined

${CLAIM_CHECKS}

/** \`JWKS_URI\` when it is https, or http on this machine (an issuer run for development). */
function jwksUri(uri: string) {
  const url = new URL(uri)
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.href
  throw new Error('JWKS_URI must be an https URL')
}

/** The keys the issuer publishes, fetched and cached. */
async function fetchKeys(uri: string) {
  const response = await fetch(uri)
  if (!response.ok) throw new Error('JWKS_URI answered ' + response.status)
  const body: unknown = await response.json()
  const keys: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'keys') : undefined
  if (!Array.isArray(keys)) throw new Error('JWKS_URI answered no keys')
  cache = { uri, keys, fetchedAt: Date.now() }
  return cache.keys
}

/** The keys for a token: the cached ones, fetched again when they are old or lack its \`kid\`. */
async function keysFor(uri: string, token: string | undefined) {
  if (cache === undefined || cache.uri !== uri) return fetchKeys(uri)
  const age = (Date.now() - cache.fetchedAt) / 1000
  if (age > JWKS_CACHE_SECONDS) return fetchKeys(uri)
  const kid = token === undefined ? undefined : decode(token).header.kid
  const known = cache.keys.some((key) => key.kid === kid)
  return known || age < JWKS_REFETCH_SECONDS ? cache.keys : fetchKeys(uri)
}

/**
 * Lets a request through with a JWT in \`Authorization: Bearer <token>\`, signed with a key the
 * issuer publishes at \`JWKS_URI\`, issued by \`JWT_ISSUER\` for \`JWT_AUDIENCE\`, with an \`exp\`, and
 * answers 401 otherwise; a token without one of REQUIRED_ROLES is answered 403. The variables are
 * read from the environment of the runtime (\`process.env\` on Node, the bindings on Workers).
 * Without one of them every request fails with 500: the app never runs unguarded. A handler reads
 * the token's payload with \`c.get('jwtPayload')\`.
 */
export const auth = createMiddleware(async (c, next) => {
  const { JWKS_URI, JWT_ISSUER, JWT_AUDIENCE } = env<{
    JWKS_URI?: string
    JWT_ISSUER?: string
    JWT_AUDIENCE?: string
  }>(c)
  if (!JWKS_URI || !JWT_ISSUER || !JWT_AUDIENCE) {
    throw new Error('JWKS_URI, JWT_ISSUER and JWT_AUDIENCE must be set')
  }
  const uri = jwksUri(JWKS_URI)
  const verify = jwk({
    keys: (ctx) => keysFor(uri, ctx.req.header('Authorization')?.split(/\\s+/)[1]),
    alg: [...ALGORITHMS],
    verification: { iss: JWT_ISSUER, aud: JWT_AUDIENCE },
  })
  return verify(c, async () => {
    // hono/jwt checks exp only when the token has it: one without it never expires.
    const payload = c.get('jwtPayload')
    if (numberClaim(payload, 'exp') === undefined) throw unauthorized('token without exp')
    if (!hasRequiredRole(payload)) throw forbidden()
    await next()
  })
})
`
}

/**
 * The module the app guards its paths with, written once and the user's to change after. Both
 * kinds take a JWT in `Authorization: Bearer <token>` and read their settings from the
 * environment of the runtime: `jwt` checks an HS256 signature with `JWT_SECRET`, `jwks` an
 * asymmetric one with the keys published at `JWKS_URI`.
 */
export function authModule(kind: AuthKind) {
  return kind === 'jwt' ? jwtAuthModule() : jwksAuthModule()
}
