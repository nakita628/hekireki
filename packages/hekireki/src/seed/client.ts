import { Effect } from 'effect'

import type { Dialect } from '../database/url.js'
import type { SeedRow, SeedValue } from './config.js'
import { SeedDatabaseError } from './errors.js'
import type { JoinTable, ModelTable, SeedTableRows } from './plan.js'
import { sequenceSql } from './sql.js'

/** Rows per `createMany`, so one call stays well under any driver's parameter limit. */
const CREATE_CHUNK = 500

/** The part of a Prisma Client the seeder calls: a batch transaction, raw SQL, and disconnect. */
type SeedClient = {
  readonly $transaction: (operations: readonly unknown[]) => Promise<unknown>
  readonly $executeRawUnsafe: (query: string) => unknown
  readonly $disconnect: () => Promise<void>
}

/** The delegate of one model (`client.user`): the writes the seeder uses. */
type Delegate = {
  readonly createMany: (args: { readonly data: readonly SeedRow[] }) => unknown
  readonly deleteMany: (args: Record<string, never>) => unknown
  readonly update: (args: {
    readonly where: Readonly<Record<string, SeedValue>>
    readonly data: Readonly<Record<string, unknown>>
  }) => unknown
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

function hasFunctions(value: unknown, names: readonly string[]) {
  return (
    typeof value === 'object' &&
    value !== null &&
    names.every((name) => isFunction(Reflect.get(value, name)))
  )
}

/** Whether the value walks and talks like a Prisma Client. */
export function isSeedClient(value: unknown): value is SeedClient {
  return hasFunctions(value, ['$transaction', '$executeRawUnsafe', '$disconnect'])
}

function isDelegate(value: unknown): value is Delegate {
  return hasFunctions(value, ['createMany', 'deleteMany', 'update'])
}

/** `User` → `user`, `OrderItem` → `orderItem`: the property Prisma Client exposes a model under. */
export function delegateName(model: string) {
  return `${model.charAt(0).toLowerCase()}${model.slice(1)}`
}

function delegateOf(client: SeedClient, model: string) {
  return Effect.gen(function* () {
    const name = delegateName(model)
    const delegate: unknown = Reflect.get(client, name)
    if (isDelegate(delegate)) return delegate
    return yield* new SeedDatabaseError({
      message: `The Prisma Client has no model delegate \`${name}\` with createMany, deleteMany and update.\n   Run \`prisma generate\` so the client knows ${model}.`,
    })
  })
}

function chunks<T>(items: readonly T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  )
}

/** The `update` calls that link the rows of an implicit many-to-many relation, one per row with partners. */
function connectOperations(delegate: Delegate, table: JoinTable, rows: readonly SeedRow[]) {
  const [a, b] = table.sides
  const partners = new Map<SeedValue, SeedValue[]>()
  for (const row of rows) {
    const own = row[a.column] ?? null
    const list = partners.get(own) ?? []
    // oxlint-disable-next-line custom/no-mutation -- pairs are grouped in place; the map is local
    list.push(row[b.column] ?? null)
    partners.set(own, list)
  }
  return [...partners.entries()].map(([own, linked]) =>
    delegate.update({
      where: { [a.idField]: own },
      data: { [a.field]: { connect: linked.map((id) => ({ [b.idField]: id })) } },
    }),
  )
}

/**
 * Writes every table through the project's Prisma Client in one `$transaction`: the optional
 * reset, `createMany` per model, `connect` per implicit many-to-many pair and, on PostgreSQL,
 * the sequence fix-ups. The client is disconnected afterwards, whatever happened.
 */
export function seedWithClient(input: {
  readonly client: unknown
  readonly entries: readonly SeedTableRows[]
  readonly reset: boolean
  readonly dialect: Dialect | null
}) {
  return Effect.gen(function* () {
    if (!isSeedClient(input.client)) {
      return yield* new SeedDatabaseError({
        message:
          '`client` must return a Prisma Client: an object with $transaction, $executeRawUnsafe and $disconnect.\n   Write `client: () => new PrismaClient({ adapter })` in hekireki.config.ts.',
      })
    }
    const client = input.client
    const models = input.entries.filter(
      (entry): entry is SeedTableRows & { readonly table: ModelTable } =>
        entry.table.kind === 'model',
    )
    const joins = input.entries.filter(
      (entry): entry is SeedTableRows & { readonly table: JoinTable } =>
        entry.table.kind === 'join',
    )
    const delegates = new Map(
      yield* Effect.forEach(models, (entry) =>
        Effect.map(delegateOf(client, entry.table.name), (d) => [entry.table.name, d] as const),
      ),
    )
    const delegate = (model: string) => delegates.get(model)
    // Implicit join tables empty themselves: their foreign keys cascade from both sides.
    const resets = input.reset
      ? models.toReversed().flatMap((entry) => delegate(entry.table.name)?.deleteMany({}) ?? [])
      : []
    const creates = models.flatMap((entry) =>
      chunks(entry.rows, CREATE_CHUNK).flatMap(
        (rows) => delegate(entry.table.name)?.createMany({ data: rows }) ?? [],
      ),
    )
    const connects = joins.flatMap((entry) => {
      const owner = delegate(entry.table.sides[0].model)
      return owner === undefined ? [] : connectOperations(owner, entry.table, entry.rows)
    })
    const sequences =
      input.dialect === null
        ? []
        : sequenceSql(
            input.dialect,
            models.map((entry) => entry.table),
          ).map((sql) => client.$executeRawUnsafe(sql))
    yield* Effect.tryPromise({
      try: () => client.$transaction([...resets, ...creates, ...connects, ...sequences]),
      catch: (error) =>
        new SeedDatabaseError({
          message: error instanceof Error ? error.message : String(error),
        }),
    }).pipe(
      Effect.ensuring(
        Effect.promise(() => client.$disconnect()).pipe(Effect.orElseSucceed(() => undefined)),
      ),
    )
    return { models: models.length, operations: resets.length + creates.length + connects.length }
  })
}
