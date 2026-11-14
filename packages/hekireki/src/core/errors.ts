import { Data } from 'effect'

/** The generator block in schema.prisma is missing or names something the generator cannot use. */
export class GeneratorConfigError extends Data.TaggedError('GeneratorConfigError')<{
  readonly message: string
}> {}

/** The project has no query compiler hekireki can load, or it refused the schema. */
export class QueryCompilerError extends Data.TaggedError('QueryCompilerError')<{
  readonly message: string
}> {}

/** Hono Takibi is not installed, or refused the document or the files it was to write. */
export class HonoTakibiError extends Data.TaggedError('HonoTakibiError')<{
  readonly message: string
}> {}
