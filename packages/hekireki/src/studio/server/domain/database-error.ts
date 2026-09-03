import * as z from 'zod'

const MISSING_TABLE = /(?:Table '.*' doesn't exist|relation ".*" does not exist|no such table)/iu
const MISSING_VALUE =
  /(?:doesn't have a default value|null value in column|NOT NULL constraint failed)/iu

const DatabaseErrorInput = z
  .object({
    message: z.string().meta({
      description: 'The driver message.',
      example: "Table 'studio.posts' doesn't exist",
    }),
  })
  .readonly()
  .meta({ description: 'A database driver error' })

/** The driver message with the way out appended, for the errors a schema-first workflow runs into. */
export function makeDatabaseErrorMessage(input: z.infer<typeof DatabaseErrorInput>) {
  if (MISSING_TABLE.test(input.message)) {
    return `${input.message} — the database has not been migrated to this schema; run \`prisma db push\` (or \`prisma migrate dev\`) with the same DATABASE_URL, then reload.`
  }
  if (MISSING_VALUE.test(input.message)) {
    return `${input.message} — the column is required and has no default; fill the field in, or give it a @default in the schema.`
  }
  return input.message
}
