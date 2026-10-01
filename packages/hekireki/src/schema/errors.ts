import { Data } from 'effect'

/** The schema path is not there, names a directory with no .prisma file, or a file did not read. */
export class SchemaFileError extends Data.TaggedError('SchemaFileError')<{
  readonly message: string
}> {}

/** Prisma rejected the schema; the message is Prisma's, as plain text. */
export class SchemaInvalidError extends Data.TaggedError('SchemaInvalidError')<{
  readonly message: string
}> {}
