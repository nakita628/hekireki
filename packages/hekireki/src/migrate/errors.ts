import { Data } from 'effect'

/** The schema cannot be read, or the command line names something the check cannot use. */
export class MigrateConfigError extends Data.TaggedError('MigrateConfigError')<{
  readonly message: string
}> {}

/** The database could not be opened, or refused one of the check's queries. */
export class MigrateDatabaseError extends Data.TaggedError('MigrateDatabaseError')<{
  readonly message: string
}> {}

/** The migrations directory holds no migration of the name asked for. */
export class MigrationNotFoundError extends Data.TaggedError('MigrationNotFoundError')<{
  readonly name: string
  readonly baseDir: string
}> {}

/** The Prisma schema engine could not be started, or refused a command. */
export class MigrateEngineError extends Data.TaggedError('MigrateEngineError')<{
  readonly message: string
}> {}
