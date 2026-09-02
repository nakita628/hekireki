import { Data } from 'effect'

export class UnknownModelError extends Data.TaggedError('UnknownModelError')<{
  readonly model: string
}> {}

export class UnknownFileError extends Data.TaggedError('UnknownFileError')<{
  readonly path: string
}> {}

export class FileWriteError extends Data.TaggedError('FileWriteError')<{
  readonly path: string
  readonly cause: string
}> {}

export class DatabaseUnavailableError extends Data.TaggedError('DatabaseUnavailableError')<{
  readonly reason: string
}> {}

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  readonly cause: string
}> {}

export class InvalidInputError extends Data.TaggedError('InvalidInputError')<{
  readonly field: string
  readonly message: string
}> {}

export class FormatError extends Data.TaggedError('FormatError')<{
  readonly cause: string
}> {}

export class ContractViolationError extends Data.TaggedError('ContractViolationError')<{
  readonly message: string
}> {}

export class SchemaLoadError extends Data.TaggedError('SchemaLoadError')<{
  readonly message: string
}> {}

export class SchemaParseError extends Data.TaggedError('SchemaParseError')<{
  readonly message: string
}> {}

export class ServerListenError extends Data.TaggedError('ServerListenError')<{
  readonly port: number
  readonly code: string | null
  readonly message: string
}> {}
