import { Data } from 'effect'

/** The generator block in schema.prisma is missing or names something the generator cannot use. */
export class GeneratorConfigError extends Data.TaggedError('GeneratorConfigError')<{
  readonly message: string
}> {}
