import { Data } from 'effect'

/** No database to talk to (no URL, no driver installed, or the connection refused); raised by the driver when it opens one. */
export class DatabaseUnavailableError extends Data.TaggedError('DatabaseUnavailableError')<{
  readonly reason: string
}> {}

/** A statement the database driver rejected; raised by the driver and worded by whoever runs the statement. */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: string
}> {}
