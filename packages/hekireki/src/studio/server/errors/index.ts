import { Data } from 'effect'

/** A model name the schema does not hold; raised by the database usecases before they touch a table. */
export class UnknownModelError extends Data.TaggedError('UnknownModelError')<{
  readonly model: string
}> {}

/** A path that is not one of the schema's files; raised by the schema usecase before it writes. */
export class UnknownFileError extends Data.TaggedError('UnknownFileError')<{
  readonly path: string
}> {}

/** A schema file could not be written; raised by `writeSchemaFile`. */
export class FileWriteError extends Data.TaggedError('FileWriteError')<{
  readonly path: string
  readonly cause: string
}> {}

/** No database to talk to (no URL, no driver installed, or the connection refused); raised by the database services when they open one. */
export class DatabaseUnavailableError extends Data.TaggedError('DatabaseUnavailableError')<{
  readonly reason: string
}> {}

/** A statement the database driver rejected; raised by the database services and worded by the database usecases. */
export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: string
}> {}

/** The project's Prisma Client (or TypeScript, to check a query) could not be found or loaded; raised by the client and TypeScript services. */
export class ClientUnavailableError extends Data.TaggedError('ClientUnavailableError')<{
  readonly reason: string
}> {}

/** A query the project's Prisma Client rejected or threw on; raised by the client service. */
export class ClientQueryError extends Data.TaggedError('ClientQueryError')<{
  readonly message: string
}> {}

/** A request field that cannot be run as given (an empty `where` or `values`, SQL with no statement, a client query that does not parse or that writes); raised by the client and database usecases. */
export class InvalidInputError extends Data.TaggedError('InvalidInputError')<{
  readonly field: string
  readonly message: string
}> {}

/** The Prisma language server could not format the schema; raised by `formatSchema`. */
export class FormatError extends Data.TaggedError('FormatError')<{
  readonly cause: string
}> {}

/** The schema file or directory could not be read; raised by the schema loader. */
export class SchemaLoadError extends Data.TaggedError('SchemaLoadError')<{
  readonly message: string
}> {}

/** The schema could not be parsed into its models; raised by the schema loader, with the language server's diagnostics. */
export class SchemaParseError extends Data.TaggedError('SchemaParseError')<{
  readonly message: string
  /** The same errors as the language server places them, so the UI can point at lines. */
  readonly diagnostics: readonly {
    readonly path: string
    readonly range: {
      readonly start: { readonly line: number; readonly character: number }
      readonly end: { readonly line: number; readonly character: number }
    }
    readonly message: string
    readonly severity: 'error' | 'warning' | 'information' | 'hint'
  }[]
}> {}

/** Studio's HTTP server could not listen on its port; raised when the server starts. */
export class ServerListenError extends Data.TaggedError('ServerListenError')<{
  readonly port: number
  readonly code: string | null
  readonly message: string
}> {}
