import * as z from 'zod'

const MISSING_TABLE = /(?:Table '.*' doesn't exist|relation ".*" does not exist|no such table)/iu
const MISSING_VALUE =
  /(?:doesn't have a default value|null value in column|NOT NULL constraint failed)/iu

const MakeDatabaseErrorMessageInput = z
  .object({
    message: z.string().meta({
      description: 'The driver message.',
      example: "Table 'studio.posts' doesn't exist",
    }),
  })
  .readonly()
  .meta({ description: 'A database driver error' })

/**
 * The driver message with the way out appended, for the errors a schema-first workflow runs into.
 *
 * @param input.message - the driver message
 * @returns the message, followed by what to do for a missing table or a missing required value
 * @example
 * makeDatabaseErrorMessage({ message: 'no such table: Post' })
 * // 'no such table: Post — the database has not been migrated to this schema; run `prisma db push`
 * //  (or `prisma migrate dev`) with the same DATABASE_URL, then reload.'
 */
export function makeDatabaseErrorMessage(input: z.infer<typeof MakeDatabaseErrorMessageInput>) {
  if (MISSING_TABLE.test(input.message)) {
    return `${input.message} — the database has not been migrated to this schema; run \`prisma db push\` (or \`prisma migrate dev\`) with the same DATABASE_URL, then reload.`
  }
  if (MISSING_VALUE.test(input.message)) {
    return `${input.message} — the column is required and has no default; fill the field in, or give it a @default in the schema.`
  }
  return input.message
}
