import { Effect } from 'effect'
import * as z from 'zod'

import { DatabaseError, DatabaseUnavailableError } from '../errors/index.js'
import type { disconnectedDbState } from './database.js'

const RequireDriverInput = z
  .object({
    db: z
      .custom<ReturnType<typeof disconnectedDbState>>()
      .meta({ description: 'The connection state.' }),
  })
  .readonly()
  .meta({ description: 'The connection state to take the driver from' })

/** The connected driver, or DatabaseUnavailableError with the reason the connection failed. */
export function requireDriver(input: z.infer<typeof RequireDriverInput>) {
  return Effect.suspend(() => {
    const driver = input.db.driver()
    return driver
      ? Effect.succeed(driver)
      : Effect.fail(
          new DatabaseUnavailableError({
            reason: input.db.status().error ?? 'No database connected.',
          }),
        )
  })
}

const RunStatementInput = z
  .object({
    driver: z
      .custom<{
        readonly query: (
          sql: string,
          params: readonly unknown[],
        ) => Promise<{
          readonly columns: readonly string[]
          readonly rows: readonly Readonly<Record<string, unknown>>[]
          readonly rowCount: number
        }>
      }>()
      .meta({ description: 'The open driver.' }),
    statement: z
      .object({
        sql: z.string().meta({
          description: 'The SQL text with placeholders.',
          example: 'SELECT * FROM users WHERE id = $1',
        }),
        params: z
          .array(z.unknown())
          .readonly()
          .meta({ description: 'The bound parameter values.' }),
      })
      .readonly()
      .meta({ description: 'The statement to run.' }),
  })
  .readonly()
  .meta({ description: 'A driver and the SQL statement to execute on it' })

/** Executes one statement; driver failures become DatabaseError with the driver message. */
export function runStatement(input: z.infer<typeof RunStatementInput>) {
  return Effect.tryPromise({
    try: () => input.driver.query(input.statement.sql, input.statement.params),
    catch: (e) => new DatabaseError({ cause: e instanceof Error ? e.message : String(e) }),
  })
}
