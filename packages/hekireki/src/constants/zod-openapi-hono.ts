// The fixed values of the Hono app Hekireki-ZodOpenAPIHono writes: how many rows a list answers.

/**
 * The rows a `GET /{resource}` answers: `limit` of them (20 when it is not given, never more than
 * 100) after `offset`, so no request makes the app read a whole table.
 *
 * Hekireki's own, stable: the numbers are written into each document and route, where a user who
 * needs others changes them.
 */
export const LIST_LIMIT = { default: 20, max: 100 } as const

/** The response header that carries how many rows a list has in all, `limit` and `offset` aside. */
export const TOTAL_COUNT_HEADER = 'X-Total-Count'

/**
 * The `@default` functions whose value the database or Prisma makes: a field with one of them is
 * the server's to fill, so neither a `POST` nor a `PATCH` takes it (`@updatedAt` neither).
 *
 * May change with a Prisma release that adds a function (`ulid()` and `nanoid()` came in 5.x):
 * when Prisma is upgraded, check the attribute functions of its schema reference, the `name` a
 * DMMF field's `default` has for each.
 */
export const GENERATED_DEFAULTS: ReadonlySet<string> = new Set([
  'autoincrement',
  'sequence',
  'now',
  'uuid',
  'cuid',
  'ulid',
  'nanoid',
  'dbgenerated',
])

/**
 * The `///` lines that keep a field from the API: `@api.hidden` neither answers nor takes it (a
 * password hash), `@api.readonly` answers it and never takes it (a role the app grants).
 *
 * Hekireki's own, stable.
 */
export const API_ACCESS_ANNOTATIONS = { hidden: '@api.hidden', readonly: '@api.readonly' } as const
