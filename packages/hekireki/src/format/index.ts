import { Data, Effect } from 'effect'
import { format } from 'oxfmt'

export class FormatError extends Data.TaggedError('FormatError')<{
  readonly message: string
}> {}

/** Formats TypeScript source with oxfmt using the repository style. */
export function fmt(input: string) {
  return Effect.gen(function* () {
    const { code, errors } = yield* Effect.promise(() =>
      format('<stdin>.ts', input, { printWidth: 100, singleQuote: true, semi: false }),
    )
    if (errors.length > 0) {
      return yield* new FormatError({ message: errors.map((e) => e.message).join('\n') })
    }
    return code
  })
}
