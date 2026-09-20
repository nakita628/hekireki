import path from 'node:path'

import { Effect } from 'effect'
import * as z from 'zod'

import { exists, makeDirectory, readFile, writeFile } from '../../file/index.js'
import { Decisions } from '../domain/decisions.js'
import { MigrateConfigError } from '../errors.js'

/** Where Studio keeps what was decided on the page, beside the schema it was decided about. */
export const DECISIONS_FILE = path.join('.hekireki', 'migrate.json')

const SavedDecisions = z
  .object({ decisions: Decisions })
  .meta({ description: 'The file Studio keeps the decisions of the Migrate page in' })

/**
 * What was decided on the page, read back. A file that is not there is no decisions, which is
 * what a project that has made none has. A file that is there and cannot be read as decisions is
 * refused: the decisions say what becomes of rows, and a plan made as if they were not there
 * would do something else to them.
 *
 * @param file - the decisions file, `.hekireki/migrate.json` beside the schema
 * @returns the decisions, empty when there is no file
 */
export function readDecisions(file: string) {
  return Effect.gen(function* () {
    const there = yield* exists(file).pipe(Effect.orElseSucceed(() => false))
    if (!there) return []
    // Each step fails with why it could not be read; the one message around it is made below.
    const text = yield* readFile(file).pipe(Effect.mapError((error) => error.message))
    const json = yield* Effect.try({
      try: (): unknown => JSON.parse(text),
      catch: (error) => (error instanceof Error ? error.message : String(error)),
    })
    const result = SavedDecisions.safeParse(json)
    if (!result.success) {
      return yield* Effect.fail(
        result.error.issues
          .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      )
    }
    return result.data.decisions
  }).pipe(
    Effect.mapError(
      (why) =>
        new MigrateConfigError({
          message: `Cannot read the decisions in ${file}: ${why}\n   Make them again on the Migrate page of hekireki studio, or put the file right.`,
        }),
    ),
  )
}

const WriteDecisionsInput = z
  .object({
    file: z.string().meta({
      description: 'The decisions file, `.hekireki/migrate.json` beside the schema.',
      example: '/app/prisma/.hekireki/migrate.json',
    }),
    decisions: Decisions,
  })
  .readonly()
  .meta({ description: 'Every decision to keep: what is left out is forgotten' })

/**
 * Writes what was decided, so it is still there the next time the page is opened, and so
 * `hekireki migrate check` and `plan` make the same plan from it: commit it with the schema.
 *
 * @param input - the decisions file, and every decision: what is left out is forgotten
 * @returns where it was written
 */
export function writeDecisions(input: z.input<typeof WriteDecisionsInput>) {
  return Effect.gen(function* () {
    // What is written is what the check will read: a decision that does not read is refused here
    // rather than kept in a file that stops every later `migrate check`.
    const result = WriteDecisionsInput.safeParse(input)
    if (!result.success) {
      return yield* new MigrateConfigError({
        message: `The decisions do not read: ${result.error.issues
          .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
          .join('; ')}`,
      })
    }
    yield* makeDirectory(path.dirname(result.data.file))
    yield* writeFile(
      result.data.file,
      `${JSON.stringify({ decisions: result.data.decisions }, null, 2)}\n`,
    )
    return result.data.file
  })
}
