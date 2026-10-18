import { randomUUID } from 'node:crypto'

import { createId } from '@paralleldrive/cuid2'
import cuid from 'cuid'
import { Clock, Effect } from 'effect'
import { nanoid } from 'nanoid'
import { ulid } from 'ulidx'
import { v7 as uuidv7 } from 'uuid'
import * as z from 'zod'

const GenerateDefaultsInput = z
  .object({
    fields: z
      .array(
        z
          .object({
            name: z.string().meta({ description: 'The Prisma field name.', example: 'id' }),
            generator: z
              .discriminatedUnion('kind', [
                z
                  .object({
                    kind: z.literal('uuid').meta({ description: 'A UUID.', example: 'uuid' }),
                    version: z.union([z.literal(4), z.literal(7)]).meta({
                      description: 'Random (`uuid()`) or time-ordered (`uuid(7)`).',
                      example: 7,
                    }),
                  })
                  .readonly(),
                z
                  .object({
                    kind: z.literal('cuid').meta({ description: 'A cuid.', example: 'cuid' }),
                    version: z
                      .union([z.literal(1), z.literal(2)])
                      .meta({ description: '`cuid()` or `cuid(2)`.', example: 2 }),
                  })
                  .readonly(),
                z
                  .object({
                    kind: z.literal('nanoid').meta({ description: 'A nanoid.', example: 'nanoid' }),
                    length: z
                      .number()
                      .int()
                      .positive()
                      .nullable()
                      .meta({ description: 'The length asked for, when one was.', example: 10 }),
                  })
                  .readonly(),
                z
                  .object({
                    kind: z.literal('ulid').meta({ description: 'A ULID.', example: 'ulid' }),
                  })
                  .readonly(),
                z
                  .object({
                    kind: z
                      .literal('now')
                      .meta({ description: 'The time of the insert.', example: 'now' }),
                  })
                  .readonly(),
                z
                  .object({
                    kind: z.literal('literal').meta({
                      description: 'A value that needs no generating.',
                      example: 'literal',
                    }),
                    value: z.string().meta({ description: 'The value itself.', example: '[]' }),
                  })
                  .readonly(),
              ])
              .meta({ description: 'What Prisma Client would generate for the field.' }),
          })
          .readonly(),
      )
      .readonly()
      .meta({ description: 'The fields to fill, as `makeGeneratedFields` lists them.' }),
  })
  .readonly()
  .meta({ description: 'The fields of a new row that the client generates' })

/**
 * The values Prisma Client would have generated for the fields, by field name: ids from the
 * packages the drizzle generator imports, so the row carries what the generated client code would
 * have produced, and the clock's time as an ISO string for `now()` and `@updatedAt`.
 */
export function generateDefaults(input: z.infer<typeof GenerateDefaultsInput>) {
  return Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    return yield* Effect.sync((): Readonly<Record<string, string>> =>
      Object.fromEntries(
        input.fields.map(({ name, generator }) => [
          name,
          generator.kind === 'uuid'
            ? generator.version === 7
              ? uuidv7({ msecs: now })
              : randomUUID()
            : generator.kind === 'cuid'
              ? generator.version === 2
                ? createId()
                : cuid()
              : generator.kind === 'nanoid'
                ? generator.length === null
                  ? nanoid()
                  : nanoid(generator.length)
                : generator.kind === 'ulid'
                  ? ulid(now)
                  : generator.kind === 'now'
                    ? new Date(now).toISOString()
                    : generator.value,
        ]),
      ),
    )
  })
}
