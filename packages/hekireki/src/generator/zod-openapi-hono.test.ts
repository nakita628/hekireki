import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { apiAccess } from '../helper/zod-openapi-hono.js'
import {
  fillHandlers,
  guardedPaths,
  guardPaths,
  handlerBodies,
  routeOperations,
  zodOpenapiHonoDocument,
} from './zod-openapi-hono.js'

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

function makeModel(overrides: Partial<DMMF.Model> & { name: string; fields: DMMF.Field[] }) {
  return {
    dbName: null,
    schema: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
    ...overrides,
  } satisfies DMMF.Model
}

const USER = makeModel({
  name: 'User',
  dbName: 'users',
  documentation: 'A user.',
  fields: [
    makeField({
      name: 'id',
      type: 'String',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'uuid', args: [] },
    }),
    makeField({ name: 'email', type: 'String', documentation: 'Login\n@z.email()' }),
    makeField({ name: 'role', type: 'Role', kind: 'enum', hasDefaultValue: true, default: 'USER' }),
    makeField({ name: 'tags', type: 'String', isList: true, isRequired: false }),
    makeField({ name: 'meta', type: 'Json', isRequired: false }),
    makeField({ name: 'createdAt', type: 'DateTime', dbName: 'created_at', isUpdatedAt: true }),
    makeField({ name: 'posts', type: 'Post', kind: 'object', isList: true, isRequired: false }),
  ],
})

const ORDER = makeModel({
  name: 'OrderItem',
  fields: [
    makeField({ name: 'orderId', type: 'BigInt' }),
    makeField({ name: 'sku', type: 'String' }),
    makeField({ name: 'price', type: 'Decimal' }),
    makeField({ name: 'image', type: 'Bytes', isRequired: false }),
  ],
  primaryKey: { name: null, fields: ['orderId', 'sku'] },
})

const LOG = makeModel({ name: 'Log', fields: [makeField({ name: 'line', type: 'String' })] })

const DATAMODEL: DMMF.Datamodel = {
  models: [USER, ORDER, LOG],
  enums: [
    {
      name: 'Role',
      values: [
        { name: 'USER', dbName: 'user' },
        { name: 'ADMIN', dbName: null },
      ],
      dbName: null,
    },
  ],
  types: [],
  indexes: [],
}

const document = zodOpenapiHonoDocument(DATAMODEL, { title: 'API', version: '1.0.0', auth: false })

describe('zodOpenapiHonoDocument', () => {
  it('writes a row as Prisma Client reads it: Prisma names, enum names, every field present', () => {
    expect(document.components.schemas.User).toStrictEqual({
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', description: 'Login' },
        role: { type: 'string', enum: ['USER', 'ADMIN'] },
        tags: { type: 'array', items: { type: 'string' } },
        meta: {},
        createdAt: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'email', 'role', 'tags', 'meta', 'createdAt'],
      description: 'A user.',
    })
  })

  it('requires what a create cannot do without, and nothing for an update, which leaves out the key', () => {
    expect(document.components.schemas.UserCreate?.required).toStrictEqual(['email'])
    expect(Object.keys(document.components.schemas.UserUpdate?.properties ?? {})).toStrictEqual([
      'email',
      'role',
      'tags',
      'meta',
    ])
    expect(document.components.schemas.UserUpdate).not.toHaveProperty('required')
  })

  it('takes no field the server fills: a generated @default or @updatedAt', () => {
    // id is @default(uuid()), createdAt is @updatedAt; role's @default("USER") is a plain value.
    expect(Object.keys(document.components.schemas.UserCreate?.properties ?? {})).toStrictEqual([
      'email',
      'role',
      'tags',
      'meta',
    ])
  })

  it('pages a list by limit and offset, at most 100, and says the total in a header', () => {
    expect(document.paths['/users']?.get).toMatchObject({
      parameters: [
        {
          name: 'limit',
          in: 'query',
          required: false,
          description: 'How many users to answer, at most 100.',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
        },
        {
          name: 'offset',
          in: 'query',
          required: false,
          description: 'How many users to skip, in the order of the key.',
          schema: { type: 'integer', minimum: 0, default: 0 },
        },
      ],
      responses: {
        '200': {
          headers: {
            'X-Total-Count': {
              description: 'How many users there are in all.',
              schema: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
    })
  })

  it('types a bigint as an integer, a decimal as a string, bytes as base64', () => {
    expect(document.components.schemas.OrderItem?.properties).toStrictEqual({
      orderId: { type: 'integer' },
      sku: { type: 'string' },
      price: { type: 'string' },
      image: { type: ['string', 'null'], format: 'byte' },
    })
  })

  it('addresses a row by every field of a composite key, and gives a model without one no item path', () => {
    expect(Object.keys(document.paths)).toStrictEqual([
      '/users',
      '/users/{id}',
      '/order-items',
      '/order-items/{orderId}/{sku}',
      '/logs',
    ])
  })
})

describe('zodOpenapiHonoDocument with auth', () => {
  const guarded = zodOpenapiHonoDocument(DATAMODEL, { title: 'API', version: '1.0.0', auth: true })

  it('asks every operation for a bearer JWT and says it answers 401 without one', () => {
    expect(guarded.components.securitySchemes).toStrictEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    })
    const item = guarded.paths['/users/{id}']
    expect(item?.parameters).toStrictEqual(document.paths['/users/{id}']?.parameters)
    for (const method of ['get', 'patch', 'delete']) {
      const operation = item?.[method]
      expect(operation).toMatchObject({
        security: [{ bearerAuth: [] }],
        responses: {
          '401': { description: 'No valid bearer token.' },
          '403': { description: 'The token holds none of the roles the API asks for.' },
        },
      })
    }
  })

  it('guards every model under its resource', () => {
    expect(guardedPaths(DATAMODEL)).toStrictEqual(['/users/*', '/order-items/*', '/logs/*'])
  })
})

describe('handlerBodies', () => {
  const bodies = handlerBodies(DATAMODEL)

  it('lists a page in the order of the key, with the total beside it', () => {
    expect(bodies.get('listUsers')).toBe(
      [
        "const { limit, offset } = c.req.valid('query')",
        'const [rows, total] = await Promise.all([',
        "prisma.user.findMany({ take: limit, skip: offset, orderBy: [{ id: 'asc' }] }),",
        'prisma.user.count(),',
        '])',
        "return c.json(rows, 200, { 'X-Total-Count': String(total) })",
      ].join('\n'),
    )
    expect(bodies.get('listOrderItems')).toContain("orderBy: [{ orderId: 'asc' }, { sku: 'asc' }]")
    expect(bodies.get('listLogs')).toContain('findMany({ take: limit, skip: offset })')
  })

  it('finds a row by its key, answering 404 where none has it', () => {
    expect(bodies.get('getUser')).toBe(
      [
        "const data = c.req.valid('param')",
        'const row = await prisma.user.findFirst({ where: { id: data.id } })',
        'if (row === null) return c.body(null, 404)',
        'return c.json(row, 200)',
      ].join('\n'),
    )
    expect(bodies.get('deleteOrderItem')).toContain("const data = c.req.valid('param')")
    expect(bodies.get('deleteOrderItem')).toContain(
      'await prisma.orderItem.deleteMany({ where: { orderId: data.orderId, sku: data.sku } })',
    )
  })

  it('answers a bigint as a number and bytes as base64, and decodes the bytes it is sent', () => {
    expect(bodies.get('listOrderItems')).toContain(
      "rows.map((row) => ({ ...row, orderId: Number(row.orderId), image: row.image === null ? null : Buffer.from(row.image).toString('base64') }))",
    )
    expect(bodies.get('createOrderItem')).toContain(
      [
        "const data = c.req.valid('json')",
        "const row = await prisma.orderItem.create({ data: { ...data, image: data.image === undefined ? undefined : data.image === null ? null : new Uint8Array(Buffer.from(data.image, 'base64')) } })",
      ].join('\n'),
    )
  })

  it('reads the body as data and hands it to Prisma as it is', () => {
    expect(bodies.get('createUser')).toBe(
      [
        "const data = c.req.valid('json')",
        'const row = await prisma.user.create({ data })',
        'return c.json(row, 201)',
      ].join('\n'),
    )
    expect(bodies.get('updateUser')).toContain(
      "const data = { ...c.req.valid('param'), ...c.req.valid('json') }\nconst { count } = await prisma.user.updateMany({ where: { id: data.id }, data })",
    )
  })

  it('reads a key field named as a variable of the handler from data like any other', () => {
    const blob = makeModel({
      name: 'Blob',
      fields: [
        makeField({ name: 'data', type: 'String', isId: true }),
        makeField({ name: 'size', type: 'Int' }),
      ],
    })
    const update = new Map(handlerBodies({ ...DATAMODEL, models: [blob] })).get('updateBlob')
    expect(update).toContain("const data = { ...c.req.valid('param'), ...c.req.valid('json') }")
    expect(update).toContain('updateMany({ where: { data: data.data }, data })')
  })

  it('has only the list and the create for a model without a key', () => {
    expect(
      [...bodies.keys()].filter((id) => id.endsWith('Log') || id.endsWith('Logs')),
    ).toStrictEqual(['listLogs', 'createLog'])
  })
})

const ROUTES = `import { createRoute, z } from '@hono/zod-openapi'

export const getUsersRoute = createRoute({
  method: 'get',
  path: '/users',
  operationId: 'listUsers',
})

export const getUsersIdRoute = createRoute({
  method: 'get',
  path: '/users/{id}',
  operationId: 'getUser',
})

export const getFollowsFollowerIdFollowingIdRoute = createRoute({
  method: 'get',
  path: '/follows/{followerId}/{followingId}',
  operationId: 'getFollow',
})
`

const HANDLERS = `import type { RouteHandler } from '@hono/zod-openapi'
import type { getUsersRoute, getUsersIdRoute, getFollowsFollowerIdFollowingIdRoute } from '../routes'

export const getUsersRouteHandler: RouteHandler<typeof getUsersRoute> = async (c) => {}

export const getUsersIdRouteHandler: RouteHandler<typeof getUsersIdRoute> = async (c) => {
  return c.json(await custom(), 200)
}

export const getFollowsFollowerIdFollowingIdRouteHandler: RouteHandler<
  typeof getFollowsFollowerIdFollowingIdRoute
> = async (
  c,
) => {}
`

describe('routeOperations', () => {
  it('reads the operation id of each route by its name', () => {
    expect([...routeOperations(ROUTES)]).toStrictEqual([
      ['getUsersRoute', 'listUsers'],
      ['getUsersIdRoute', 'getUser'],
      ['getFollowsFollowerIdFollowingIdRoute', 'getFollow'],
    ])
  })
})

describe('fillHandlers', () => {
  const operations = routeOperations(ROUTES)
  const bodies = new Map([
    ['listUsers', 'const rows = await prisma.user.findMany()\nreturn c.json(rows, 200)'],
    ['getUser', 'return c.body(null, 404)'],
    ['getFollow', 'return c.body(null, 404)'],
  ])

  it('fills an empty handler, keeps one that has a body, and imports prisma after the imports', () => {
    const filled = fillHandlers(HANDLERS, operations, bodies, '../prisma')
    expect(filled).toContain("from '../routes'\nimport { prisma } from '../prisma'\n")
    expect(filled).toContain(
      'RouteHandler<typeof getUsersRoute> = async (c) => {\nconst rows = await prisma.user.findMany()\nreturn c.json(rows, 200)\n}',
    )
    expect(filled).toContain('return c.json(await custom(), 200)')
    expect(filled).toContain(
      '  typeof getFollowsFollowerIdFollowingIdRoute\n> = async (c) => {\nreturn c.body(null, 404)\n}',
    )
  })

  it('keeps a handler with only a comment between its braces, and a file that does not parse', () => {
    const commented = HANDLERS.replace(
      'RouteHandler<typeof getUsersRoute> = async (c) => {}',
      'RouteHandler<typeof getUsersRoute> = async (c) => {\n  // later\n}',
    )
    expect(fillHandlers(commented, operations, bodies, '../prisma')).toContain('// later')
    const broken = `${HANDLERS}\nexport const = `
    expect(fillHandlers(broken, operations, bodies, '../prisma')).toBe(broken)
  })

  it('changes nothing when every handler has a body', () => {
    const filled = fillHandlers(HANDLERS, operations, bodies, '../prisma')
    expect(fillHandlers(filled, operations, bodies, '../prisma')).toBe(filled)
  })
})

const APP = `import { OpenAPIHono } from '@hono/zod-openapi'
import { getUsersRoute } from './routes'

const app = new OpenAPIHono()

export const api = app.openapi(getUsersRoute, getUsersRouteHandler)

export default app
`

describe('guardPaths', () => {
  it('imports auth and runs it on every path after the app is made', () => {
    expect(guardPaths(APP, ['/users/*', '/posts/*'])).toBe(
      [
        "import { OpenAPIHono } from '@hono/zod-openapi'",
        "import { getUsersRoute } from './routes'",
        "import { auth } from './auth'",
        '',
        'const app = new OpenAPIHono()',
        '',
        "app.use('/users/*', auth)",
        "app.use('/posts/*', auth)",
        '',
        'export const api = app.openapi(getUsersRoute, getUsersRouteHandler)',
        '',
        'export default app',
        '',
      ].join('\n'),
    )
  })

  it('adds only the paths not yet guarded, after the last guard, and leaves a guarded app as it is', () => {
    const once = guardPaths(APP, ['/users/*'])
    expect(guardPaths(once, ['/users/*'])).toBe(once)
    const twice = guardPaths(once, ['/users/*', '/posts/*'])
    expect(twice).toContain("app.use('/users/*', auth)\napp.use('/posts/*', auth)\n")
    expect(twice.match(/import \{ auth \}/gu)).toHaveLength(1)
  })

  it('leaves a file without an OpenAPIHono app as it is', () => {
    const code = 'export const x = 1\n'
    expect(guardPaths(code, ['/users/*'])).toBe(code)
  })
})

describe('@api.hidden and @api.readonly', () => {
  const ACCOUNT = makeModel({
    name: 'Account',
    fields: [
      makeField({
        name: 'id',
        type: 'Int',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      makeField({ name: 'email', type: 'String' }),
      makeField({
        name: 'role',
        type: 'String',
        hasDefaultValue: true,
        default: 'user',
        documentation: '@api.readonly',
      }),
      makeField({
        name: 'passwordHash',
        type: 'String',
        documentation: 'The bcrypt hash.\n@api.hidden',
      }),
      makeField({ name: 'secret', type: 'Bytes', isRequired: false, documentation: '@api.hidden' }),
    ],
  })
  const datamodel = { ...DATAMODEL, models: [ACCOUNT] }
  const doc = zodOpenapiHonoDocument(datamodel, { title: 'API', version: '1.0.0', auth: false })
  const bodies = handlerBodies(datamodel)

  it('reads what a field comment keeps from the API', () => {
    expect(apiAccess('The bcrypt hash.\n@api.hidden')).toBe('hidden')
    expect(apiAccess('  @api.readonly  ')).toBe('readonly')
    expect(apiAccess('Mentions @api.hidden in prose')).toBeUndefined()
    expect(apiAccess(undefined)).toBeUndefined()
  })

  it('answers neither hidden field, and the readonly one', () => {
    expect(Object.keys(doc.components.schemas.Account?.properties ?? {})).toStrictEqual([
      'id',
      'email',
      'role',
    ])
  })

  it('takes neither the hidden nor the readonly fields, on a create or an update', () => {
    expect(Object.keys(doc.components.schemas.AccountCreate?.properties ?? {})).toStrictEqual([
      'email',
    ])
    expect(Object.keys(doc.components.schemas.AccountUpdate?.properties ?? {})).toStrictEqual([
      'email',
    ])
  })

  it('omits the hidden fields from every row Prisma answers, and never encodes one', () => {
    for (const id of ['listAccounts', 'createAccount', 'getAccount', 'updateAccount']) {
      expect(bodies.get(id)).toContain('omit: { passwordHash: true, secret: true }')
      expect(bodies.get(id)).not.toContain('Buffer')
    }
  })
})
