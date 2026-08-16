// Pins semantic invariants in the type system so `tsc --strict` catches a
// regression that would otherwise type-check: Generated<T> must unwrap to T on
// select and go optional on insert, a DateTime column must select as Date, an
// optional column must be `T | null`, an enum column must stay a value union
// of the @map-ped database values, the DB interface must be keyed by the
// @@map-ped table names, and the implicit m2m join tables must exist.
import {
  DummyDriver,
  type Insertable,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Selectable,
  type Updateable,
} from 'kysely'

import type * as t from './types'

const db = new Kysely<t.DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (database) => new PostgresIntrospector(database),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

export const accountQuery = db
  .selectFrom('accounts')
  .select(['id', 'created_at', 'status'])
  .compile()

export const joinQuery = db
  .selectFrom('_PostToTag')
  .innerJoin('Post', 'Post.id', '_PostToTag.A')
  .innerJoin('Tag', 'Tag.id', '_PostToTag.B')
  .select(['Post.title', 'Tag.label'])
  .compile()

export const castQuery = db.selectFrom('_cast').select(['A', 'B']).compile()

type Account = Selectable<t.Account>
type Profile = Selectable<t.Profile>
type Board = Selectable<t.Board>
type Sequence = Selectable<t.Sequence>
type Torture = Selectable<t.Torture>
type Inventory = Selectable<t.Inventory>
type NewPost = Insertable<t.Post>

type Expect<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export type Cases = [
  Expect<Equal<Account['tags'], string[]>>,
  Expect<Equal<Account['bigNum'], bigint>>,
  Expect<Equal<Account['status'], 'ACTIVE' | 'INACTIVE' | 'PENDING_REVIEW'>>,
  Expect<Equal<Account['created_at'], Date>>,
  Expect<Equal<Account['raw'], Buffer>>,
  Expect<Equal<Profile['bio'], string | null>>,
  Expect<Equal<Profile['age'], number | null>>,
  Expect<Equal<Board['visibility'], 'public' | 'private' | 'link_only'>>,
  Expect<Equal<Board['fallback'], 'public' | 'private' | 'link_only' | null>>,
  Expect<Equal<Board['audiences'], ('public' | 'private' | 'link_only')[]>>,
  Expect<Equal<Sequence['id'], bigint>>,
  Expect<Equal<Torture['born'], Date>>,
  Expect<Equal<Inventory['codes'], number[]>>,
  Expect<Equal<NewPost['id'], string | undefined>>,
  // The generated Generated<T> must preserve the insert/update sides of a
  // nested ColumnType, not collapse them back to the select type.
  Expect<Equal<Insertable<t.Account>['created_at'], Date | string | undefined>>,
  // Updateable makes every key optional, so undefined joins the update type.
  Expect<Equal<Updateable<t.Account>['created_at'], Date | string | undefined>>,
  // @updatedAt without @default is Prisma-Client-managed, not DB-managed, so
  // a raw kysely insert must still provide it.
  Expect<Equal<Insertable<t.Profile>['updated_at'], Date | string>>,
]
