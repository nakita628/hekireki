// Pins semantic invariants in the type system so `tsc --strict` catches a
// regression that would otherwise type-check: a scalar list must stay a
// non-null array, an optional column must be `T | null`, a BigInt column must
// infer `bigint`, and an enum column must stay a value union.
import type { InferSelectModel } from 'drizzle-orm'

import type * as schema from './schema'

type Account = InferSelectModel<typeof schema.accounts>
type Profile = InferSelectModel<typeof schema.profile>

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export type Cases = [
  Expect<Equal<Account['tags'], string[]>>,
  Expect<Equal<Account['bigNum'], bigint>>,
  Expect<Equal<Account['status'], 'ACTIVE' | 'INACTIVE' | 'PENDING_REVIEW'>>,
  Expect<Equal<Profile['bio'], string | null>>,
  Expect<Equal<Profile['age'], number | null>>,
]
