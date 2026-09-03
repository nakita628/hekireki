import { randomUUID } from 'node:crypto'

import { createId } from '@paralleldrive/cuid2'
import cuid from 'cuid'
import { nanoid } from 'nanoid'
import { ulid } from 'ulidx'
import { v7 as uuidv7 } from 'uuid'
import * as z from 'zod'

const MakeGeneratedDefaultsInput = z
  .object({
    model: z
      .object({
        fields: z
          .array(
            z
              .object({
                name: z
                  .string()
                  .meta({ description: 'The Prisma field name.', example: 'createdAt' }),
                kind: z
                  .enum(['scalar', 'object', 'enum', 'unsupported'])
                  .meta({ description: 'What the field holds.', example: 'scalar' }),
                isList: z
                  .boolean()
                  .meta({ description: 'Whether the field is a list.', example: false }),
                isRequired: z
                  .boolean()
                  .meta({ description: 'Whether the field is required.', example: true }),
                isUpdatedAt: z
                  .boolean()
                  .meta({ description: 'Whether the field carries @updatedAt.', example: false }),
                default: z.string().nullable().meta({
                  description: 'The @default as it is written, when the field has one.',
                  example: 'uuid(7)',
                }),
              })
              .readonly(),
          )
          .readonly()
          .meta({ description: 'The fields of the model.' }),
      })
      .readonly()
      .meta({ description: 'The Prisma model of the row.' }),
    row: z
      .record(z.string(), z.unknown())
      .readonly()
      .meta({ description: 'The values the user gave, by field name.' }),
    now: z.number().optional().meta({
      description: 'The insert time in Unix milliseconds; the clock when omitted.',
      example: 1_788_000_000_000,
    }),
  })
  .readonly()
  .meta({ description: 'A model and the values given for a new row' })

/**
 * The values Prisma would generate for the fields the user left out: ids from `uuid()`, `cuid()`,
 * `nanoid()`, `ulid()`, timestamps from `now()` and `@updatedAt`, and an empty list for a
 * required list field.
 */
export function makeGeneratedDefaults(input: z.infer<typeof MakeGeneratedDefaultsInput>) {
  const now = input.now ?? Date.now()
  return Object.fromEntries(
    input.model.fields.flatMap((field) => {
      if (field.kind === 'object' || field.kind === 'unsupported') return []
      if (field.name in input.row) return []
      // Prisma fills these in the client, not in the database, which supplies autoincrement(),
      // dbgenerated(), sequence() and literals. The packages are the ones the drizzle generator
      // imports, so the row carries the value the generated client code would have produced.
      const generated = /^(?<name>uuid|cuid|nanoid|ulid|now)\((?<argument>[^)]*)\)$/u.exec(
        field.default ?? '',
      )?.groups
      const argument = generated?.argument?.trim() ?? ''
      const length = Number(argument)
      const value =
        generated?.name === 'uuid'
          ? argument === '7'
            ? uuidv7({ msecs: now })
            : randomUUID()
          : generated?.name === 'cuid'
            ? argument === '2'
              ? createId()
              : cuid()
            : generated?.name === 'nanoid'
              ? Number.isInteger(length) && length > 0
                ? nanoid(length)
                : nanoid()
              : generated?.name === 'ulid'
                ? ulid(now)
                : generated?.name === 'now'
                  ? new Date(now).toISOString()
                  : null
      if (value !== null) return [[field.name, value] as const]
      if (field.isUpdatedAt) return [[field.name, new Date(now).toISOString()] as const]
      if (field.isList && field.isRequired && field.default === null) {
        return [[field.name, '[]'] as const]
      }
      return []
    }),
  )
}
