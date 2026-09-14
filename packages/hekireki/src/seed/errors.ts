import { Data } from 'effect'

/** hekireki.config.ts is missing, cannot be loaded, or names something the seeder cannot use. */
export class SeedConfigError extends Data.TaggedError('SeedConfigError')<{
  readonly message: string
}> {}

/** The schema cannot be seeded as configured: a required relation cycle, an unsatisfiable unique constraint. */
export class SeedGenerationError extends Data.TaggedError('SeedGenerationError')<{
  readonly message: string
}> {}

/** The database refused the connection or a statement; the transaction was rolled back. */
export class SeedDatabaseError extends Data.TaggedError('SeedDatabaseError')<{
  readonly message: string
}> {}
