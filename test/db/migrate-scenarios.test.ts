import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { cli, decide, diff, prisma, run, TARGETS, workspace } from './migrate-harness.ts'
import type { Decision, Row, Target } from './migrate-harness.ts'

// `hekireki migrate check` and `plan --migration` end to end, scenario by scenario, on every
// database there is: the old schema's tables from `prisma db push`, rows that do not fit the new
// one, the migration Prisma writes for the change, the check (which has to pass with the decisions
// of the Migrate page) and the plan, run for real. Then `prisma migrate diff --exit-code` has to find no
// difference between the database and the new schema, and the rows have to be the ones the
// scenario says. The plan has to keep Prisma's comments and add none but its marker, and on
// PostgreSQL be one DO block. SQLite runs everywhere; the others need the connection strings of
// migrate-harness.ts.

const RUN = `hekireki_scenario_${process.pid}_${Date.now()}`

type Dialect = Target['dialect']

/** SQL the dialects spell each their own way. */
const SQL = {
  toInt: (dialect: Dialect, column: string) =>
    `CAST(NULLIF(${column}, '') AS ${{ sqlite: 'INTEGER', postgresql: 'INTEGER', mysql: 'SIGNED', cockroachdb: 'INT4' }[dialect]})`,
  prefixed: (dialect: Dialect, prefix: string, column: string) =>
    dialect === 'mysql'
      ? `CONCAT('${prefix}', ${column})`
      : dialect === 'cockroachdb'
        ? `'${prefix}' || ${column}::STRING`
        : `'${prefix}' || ${column}`,
  beforeAt: (dialect: Dialect, column: string) =>
    dialect === 'sqlite'
      ? `substr(${column}, 1, instr(${column}, '@') - 1)`
      : dialect === 'mysql'
        ? `SUBSTRING_INDEX(${column}, '@', 1)`
        : `split_part(${column}, '@', 1)`,
}

type Quote = (name: string) => string

type Scenario = {
  readonly name: string
  /** The models and enums of the old schema and the new one, without the datasource. */
  readonly old: string
  readonly next: string
  /** The decisions of the Migrate page, as Studio keeps them in `.hekireki/migrate.json`. */
  readonly decisions: (dialect: Dialect) => readonly Decision[]
  /** The rows of the old schema that the new one does not take as they are. */
  readonly rows: (q: Quote) => readonly string[]
  /** The fixes the check lists, with the rows each changes. */
  readonly fixes?: readonly (readonly [string, number])[]
  /** Queries on the migrated database and the rows each has to find, every value as text. */
  readonly after: readonly {
    readonly sql: (q: Quote) => string
    readonly rows: readonly (readonly (string | null)[])[]
  }[]
}

const SCENARIOS: readonly Scenario[] = [
  {
    name: 'renames',
    old: `model User {
  id       Int     @id
  nickname String?
  views    String?
  bio      String?
}

model Post {
  id   Int    @id
  body String @default("")
}`,
    next: `model User {
  id          Int     @id
  displayName String?
  viewCount   Int?
  bio         String?
}

model Post {
  id      Int    @id
  content String @default("")
}`,
    decisions: (dialect) => [
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'nickname',
        choice: 'rename',
        value: 'displayName',
      },
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'views',
        choice: 'rename',
        value: 'viewCount',
      },
      {
        kind: 'column-type',
        modelName: 'User',
        field: 'viewCount',
        choice: 'sql',
        value: SQL.toInt(dialect, 'views'),
      },
      {
        kind: 'column-dropped',
        modelName: 'Post',
        field: 'body',
        choice: 'rename',
        value: 'content',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('User')} (${q('id')}, ${q('nickname')}, ${q('views')}, ${q('bio')}) VALUES (1, 'ann', '10', 'x'), (2, NULL, '', NULL)`,
      `INSERT INTO ${q('Post')} (${q('id')}, ${q('body')}) VALUES (1, 'hello'), (2, '')`,
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('displayName')}, ${q('viewCount')}, ${q('bio')} FROM ${q('User')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'ann', '10', 'x'],
          ['2', null, null, null],
        ],
      },
      {
        sql: (q) => `SELECT ${q('id')}, ${q('content')} FROM ${q('Post')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'hello'],
          ['2', ''],
        ],
      },
    ],
  },
  {
    name: 'fills',
    old: `model Item {
  id   Int    @id
  name String
}`,
    next: `enum Kind {
  A
  B
}

model Item {
  id    Int    @id
  name  String
  code  String @unique
  score Int    @default(0)
  kind  Kind
}`,
    decisions: (dialect) => [
      {
        kind: 'column-added',
        modelName: 'Item',
        field: 'code',
        choice: 'sql',
        value: SQL.prefixed(dialect, 'i-', 'id'),
      },
      { kind: 'column-added', modelName: 'Item', field: 'kind', choice: 'value', value: 'B' },
    ],
    rows: (q) => [`INSERT INTO ${q('Item')} (${q('id')}, ${q('name')}) VALUES (1, 'a'), (2, 'b')`],
    fixes: [
      ['Item.code', 2],
      ['Item.kind', 2],
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('name')}, ${q('code')}, ${q('score')}, ${q('kind')} FROM ${q('Item')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'a', 'i-1', '0', 'B'],
          ['2', 'b', 'i-2', '0', 'B'],
        ],
      },
    ],
  },
  {
    name: 'enums',
    old: `enum Role {
  ADMIN
  EDITOR
  GUEST
  VIEWER
}

model User {
  id   Int  @id
  role Role @default(VIEWER)
}

model Invite {
  id   Int  @id
  role Role
}`,
    next: `enum Role {
  ADMIN
  VIEWER
  WRITER
}

model User {
  id   Int  @id
  role Role @default(VIEWER)
}

model Invite {
  id   Int  @id
  role Role
}`,
    // GUEST goes to a member there is now, EDITOR to one the migration adds.
    decisions: () => [
      {
        kind: 'enum',
        modelName: 'User',
        field: 'role',
        choice: 'map',
        value: 'EDITOR=WRITER, GUEST=VIEWER',
      },
      {
        kind: 'enum',
        modelName: 'Invite',
        field: 'role',
        choice: 'map',
        value: 'EDITOR=WRITER, GUEST=VIEWER',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('User')} (${q('id')}, ${q('role')}) VALUES (1, 'ADMIN'), (2, 'EDITOR'), (3, 'GUEST')`,
      `INSERT INTO ${q('Invite')} (${q('id')}, ${q('role')}) VALUES (1, 'EDITOR'), (2, 'GUEST')`,
    ],
    after: [
      {
        sql: (q) => `SELECT ${q('id')}, ${q('role')} FROM ${q('User')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'ADMIN'],
          ['2', 'WRITER'],
          ['3', 'VIEWER'],
        ],
      },
      {
        sql: (q) => `SELECT ${q('id')}, ${q('role')} FROM ${q('Invite')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'WRITER'],
          ['2', 'VIEWER'],
        ],
      },
    ],
  },
  {
    name: 'together',
    old: `model User {
  id    Int     @id
  email String
  name  String?
  posts Post[]
}

model Category {
  id   Int    @id
  name String
}

model Post {
  id         Int    @id
  title      String
  categoryId Int?
  authorId   Int
  author     User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
}`,
    next: `model User {
  id    Int    @id
  email String @unique
  name  String
  posts Post[]
}

model Category {
  id    Int    @id
  name  String
  posts Post[]
}

model Post {
  id         Int       @id
  slug       String    @unique
  title      String
  categoryId Int?
  category   Category? @relation(fields: [categoryId], references: [id])
  authorId   Int
  author     User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
}`,
    // The NULL name is filled, the later of two users on one address goes with its post (ON
    // DELETE CASCADE), the post in a category that is not there leaves it, and the posts left
    // get a slug.
    decisions: (dialect) => [
      {
        kind: 'not-null',
        modelName: 'User',
        field: 'name',
        choice: 'sql',
        value: SQL.beforeAt(dialect, 'email'),
      },
      {
        kind: 'unique',
        modelName: 'User',
        field: 'email',
        choice: 'keep-first-delete',
        value: 'id',
      },
      {
        kind: 'column-added',
        modelName: 'Post',
        field: 'slug',
        choice: 'sql',
        value: SQL.prefixed(dialect, 'p-', 'id'),
      },
      { kind: 'foreign-key', modelName: 'Post', field: 'category', choice: 'null', value: null },
    ],
    rows: (q) => [
      `INSERT INTO ${q('User')} (${q('id')}, ${q('email')}, ${q('name')}) VALUES (1, 'a@x.io', NULL), (2, 'b@x.io', 'Bo'), (3, 'a@x.io', 'Old A')`,
      `INSERT INTO ${q('Category')} (${q('id')}, ${q('name')}) VALUES (1, 'News')`,
      `INSERT INTO ${q('Post')} (${q('id')}, ${q('title')}, ${q('categoryId')}, ${q('authorId')}) VALUES (1, 't1', 1, 1), (2, 't2', NULL, 3), (3, 't3', 9, 2)`,
    ],
    fixes: [
      ['User.name', 1],
      ['User.email', 1],
      ['Post.category → Category', 1],
      ['Post.slug', 2],
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('email')}, ${q('name')} FROM ${q('User')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'a@x.io', 'a'],
          ['2', 'b@x.io', 'Bo'],
        ],
      },
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('slug')}, ${q('title')}, ${q('categoryId')}, ${q('authorId')} FROM ${q('Post')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'p-1', 't1', '1', '1'],
          ['3', 'p-3', 't3', null, '2'],
        ],
      },
    ],
  },
  {
    name: 'mapped',
    old: `model User {
  id   Int     @id
  nick String? @map("nick_name")

  @@map("users")
}`,
    next: `model User {
  id          Int     @id
  displayName String? @map("display_name")

  @@map("users")
}`,
    // renamedFrom names the column as the database has it.
    decisions: () => [
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'nick_name',
        choice: 'rename',
        value: 'displayName',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('users')} (${q('id')}, ${q('nick_name')}) VALUES (1, 'ann'), (2, NULL)`,
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('display_name')} FROM ${q('users')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'ann'],
          ['2', null],
        ],
      },
    ],
  },
  {
    name: 'types',
    old: `model Stat {
  id    Int     @id
  hits  Int?
  total BigInt?
}`,
    next: `model Stat {
  id    Int     @id
  hits  String?
  total Int?
}`,
    // No decision to make: every value fits. Prisma changes both types in place, which
    // CockroachDB does only with the declarative schema changer the plan turns on.
    decisions: () => [],
    rows: (q) => [
      `INSERT INTO ${q('Stat')} (${q('id')}, ${q('hits')}, ${q('total')}) VALUES (1, 10, 100), (2, NULL, NULL)`,
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('hits')}, ${q('total')} FROM ${q('Stat')} ORDER BY ${q('id')}`,
        rows: [
          ['1', '10', '100'],
          ['2', null, null],
        ],
      },
    ],
  },
  {
    // A composite primary key, a composite foreign key behind it, and a delete that runs down
    // both: the duplicate tenant goes, its items go with it, and the parts of those items too.
    name: 'composite',
    old: `model Tenant {
  id    Int    @id
  code  String
  items Item[]
}

model Item {
  tenantId Int
  sku      String
  label    String?
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parts    Part[]

  @@id([tenantId, sku])
}

model Part {
  id       Int    @id
  tenantId Int
  sku      String
  item     Item   @relation(fields: [tenantId, sku], references: [tenantId, sku], onDelete: Cascade)
}`,
    next: `model Tenant {
  id    Int    @id
  code  String @unique
  items Item[]
}

model Item {
  tenantId Int
  sku      String
  label    String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  parts    Part[]

  @@id([tenantId, sku])
}

model Part {
  id       Int    @id
  tenantId Int
  sku      String
  item     Item   @relation(fields: [tenantId, sku], references: [tenantId, sku], onDelete: Cascade)
}`,
    decisions: (dialect) => [
      {
        kind: 'unique',
        modelName: 'Tenant',
        field: 'code',
        choice: 'keep-first-delete',
        value: 'id',
      },
      {
        kind: 'column-added',
        modelName: 'Item',
        field: 'label',
        choice: 'sql',
        value: SQL.prefixed(dialect, 'item-', 'sku'),
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('Tenant')} (${q('id')}, ${q('code')}) VALUES (1, 'a'), (2, 'a'), (3, 'b')`,
      `INSERT INTO ${q('Item')} (${q('tenantId')}, ${q('sku')}, ${q('label')}) VALUES (1, 'x', NULL), (2, 'y', 'kept'), (3, 'z', NULL)`,
      `INSERT INTO ${q('Part')} (${q('id')}, ${q('tenantId')}, ${q('sku')}) VALUES (1, 1, 'x'), (2, 2, 'y'), (3, 3, 'z')`,
    ],
    fixes: [
      ['Tenant.code', 1],
      ['Item.label', 2],
    ],
    after: [
      {
        sql: (q) => `SELECT ${q('id')}, ${q('code')} FROM ${q('Tenant')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'a'],
          ['3', 'b'],
        ],
      },
      {
        sql: (q) =>
          `SELECT ${q('tenantId')}, ${q('sku')}, ${q('label')} FROM ${q('Item')} ORDER BY ${q('tenantId')}`,
        rows: [
          ['1', 'x', 'item-x'],
          ['3', 'z', 'item-z'],
        ],
      },
      {
        sql: (q) => `SELECT ${q('id')} FROM ${q('Part')} ORDER BY ${q('id')}`,
        rows: [['1'], ['3']],
      },
    ],
  },
  {
    // Two tables that point at each other: deleting a user takes its profile (CASCADE), and the
    // user that profile belonged to loses its key (SET NULL). The cascade must not run in circles.
    name: 'cycle',
    old: `model User {
  id        Int      @id
  email     String
  profileId Int?     @unique
  profile   Profile? @relation("user_profile", fields: [profileId], references: [id], onDelete: SetNull)
  owned     Profile? @relation("profile_owner")
}

model Profile {
  id      Int   @id
  bio     String?
  ownerId Int?  @unique
  owner   User? @relation("profile_owner", fields: [ownerId], references: [id], onDelete: Cascade)
  user    User? @relation("user_profile")
}`,
    next: `model User {
  id        Int      @id
  email     String   @unique
  profileId Int?     @unique
  profile   Profile? @relation("user_profile", fields: [profileId], references: [id], onDelete: SetNull)
  owned     Profile? @relation("profile_owner")
}

model Profile {
  id      Int   @id
  bio     String?
  ownerId Int?  @unique
  owner   User? @relation("profile_owner", fields: [ownerId], references: [id], onDelete: Cascade)
  user    User? @relation("user_profile")
}`,
    decisions: () => [
      {
        kind: 'unique',
        modelName: 'User',
        field: 'email',
        choice: 'keep-first-delete',
        value: 'id',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('User')} (${q('id')}, ${q('email')}, ${q('profileId')}) VALUES (1, 'a@x.io', NULL), (2, 'a@x.io', NULL), (3, 'b@x.io', NULL)`,
      `INSERT INTO ${q('Profile')} (${q('id')}, ${q('bio')}, ${q('ownerId')}) VALUES (10, 'of two', 2), (11, 'of three', 3)`,
      `UPDATE ${q('User')} SET ${q('profileId')} = 10 WHERE ${q('id')} = 1`,
    ],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('email')}, ${q('profileId')} FROM ${q('User')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'a@x.io', null],
          ['3', 'b@x.io', null],
        ],
      },
      {
        sql: (q) => `SELECT ${q('id')}, ${q('ownerId')} FROM ${q('Profile')} ORDER BY ${q('id')}`,
        rows: [['11', '3']],
      },
    ],
  },
  {
    // The join table Prisma keeps for an implicit many-to-many: the rows of a deleted post go
    // with it, through foreign keys nobody wrote by hand.
    name: 'manyToMany',
    old: `model Post {
  id    Int    @id
  title String
  tags  Tag[]
}

model Tag {
  id    Int    @id
  label String
  posts Post[]
}`,
    next: `model Post {
  id    Int    @id
  title String @unique
  tags  Tag[]
}

model Tag {
  id    Int    @id
  label String
  posts Post[]
}`,
    decisions: () => [
      {
        kind: 'unique',
        modelName: 'Post',
        field: 'title',
        choice: 'keep-first-delete',
        value: 'id',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('Post')} (${q('id')}, ${q('title')}) VALUES (1, 'one'), (2, 'one'), (3, 'two')`,
      `INSERT INTO ${q('Tag')} (${q('id')}, ${q('label')}) VALUES (1, 'red'), (2, 'blue')`,
      `INSERT INTO ${q('_PostToTag')} (${q('A')}, ${q('B')}) VALUES (1, 1), (2, 1), (2, 2), (3, 2)`,
    ],
    after: [
      {
        sql: (q) => `SELECT ${q('id')} FROM ${q('Post')} ORDER BY ${q('id')}`,
        rows: [['1'], ['3']],
      },
      {
        sql: (q) =>
          `SELECT ${q('A')}, ${q('B')} FROM ${q('_PostToTag')} ORDER BY ${q('A')}, ${q('B')}`,
        rows: [
          ['1', '1'],
          ['3', '2'],
        ],
      },
    ],
  },
  {
    // An enum whose members are stored under other names: the decision names the value the
    // database holds and the member it becomes, and the migration carries it over.
    name: 'enumMapped',
    old: `enum Status {
  DRAFT  @map("draft")
  REVIEW @map("review")
  LIVE   @map("live")
}

model Article {
  id     Int    @id
  status Status
}`,
    next: `enum Status {
  DRAFT    @map("draft")
  LIVE     @map("live")
  ARCHIVED @map("archived")
}

model Article {
  id     Int    @id
  status Status
}`,
    decisions: () => [
      {
        kind: 'enum',
        modelName: 'Article',
        field: 'status',
        choice: 'map',
        value: 'review=ARCHIVED',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('Article')} (${q('id')}, ${q('status')}) VALUES (1, 'draft'), (2, 'review'), (3, 'live')`,
    ],
    fixes: [['Article.status', 1]],
    after: [
      {
        sql: (q) => `SELECT ${q('id')}, ${q('status')} FROM ${q('Article')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'draft'],
          ['2', 'archived'],
          ['3', 'live'],
        ],
      },
    ],
  },
  {
    // A required column added and filled from another table, which only SQL can answer.
    name: 'lookupFill',
    old: `model Customer {
  id     Int     @id
  name   String
  orders Order[]
}

model Order {
  id         Int      @id
  customerId Int
  customer   Customer @relation(fields: [customerId], references: [id])
}`,
    next: `model Customer {
  id     Int     @id
  name   String
  orders Order[]
}

model Order {
  id           Int      @id
  customerId   Int
  customerName String
  customer     Customer @relation(fields: [customerId], references: [id])
}`,
    decisions: (dialect) => {
      const q = (name: string) => (dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
      return [
        {
          kind: 'column-added',
          modelName: 'Order',
          field: 'customerName',
          choice: 'sql',
          value: `(SELECT ${q('Customer')}.${q('name')} FROM ${q('Customer')} WHERE ${q('Customer')}.${q('id')} = ${q('Order')}.${q('customerId')})`,
        },
      ]
    },
    rows: (q) => [
      `INSERT INTO ${q('Customer')} (${q('id')}, ${q('name')}) VALUES (1, 'Ann'), (2, 'Bo')`,
      `INSERT INTO ${q('Order')} (${q('id')}, ${q('customerId')}) VALUES (1, 1), (2, 2), (3, 1)`,
    ],
    fixes: [['Order.customerName', 3]],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('id')}, ${q('customerName')} FROM ${q('Order')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'Ann'],
          ['2', 'Bo'],
          ['3', 'Ann'],
        ],
      },
    ],
  },
  {
    // The primary key itself changes: the old one is dropped and a composite one takes its
    // place, so the rows that would collide under it have to go first.
    name: 'primaryKey',
    old: `model Ticket {
  id       Int    @id
  tenantId Int
  code     String
  label    String
}`,
    next: `model Ticket {
  tenantId Int
  code     String
  label    String

  @@id([tenantId, code])
}`,
    decisions: () => [
      {
        kind: 'unique',
        modelName: 'Ticket',
        field: 'tenantId, code',
        choice: 'keep-first-delete',
        value: 'label',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('Ticket')} (${q('id')}, ${q('tenantId')}, ${q('code')}, ${q('label')}) VALUES (1, 1, 'a', 'first'), (2, 1, 'a', 'second'), (3, 2, 'a', 'other')`,
    ],
    fixes: [['Ticket.tenantId, code', 1]],
    after: [
      {
        sql: (q) =>
          `SELECT ${q('tenantId')}, ${q('code')}, ${q('label')} FROM ${q('Ticket')} ORDER BY ${q('tenantId')}`,
        rows: [
          ['1', 'a', 'first'],
          ['2', 'a', 'other'],
        ],
      },
    ],
  },
  {
    // A column moved to a related model, both ways round: down to a table the migration creates
    // (each profile made from its user's value), and up from the rows that point at one row, which
    // do not agree on User 1: the first post by its key that has a name is the one that stays.
    name: 'moves',
    old: `model User {
  id    Int     @id
  bio   String?
  posts Post[]
}

model Post {
  id         Int     @id
  authorName String?
  authorId   Int
  author     User    @relation(fields: [authorId], references: [id])
}`,
    next: `model User {
  id         Int      @id
  authorName String?
  posts      Post[]
  profile    Profile?
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}

model Profile {
  id     String  @id @default(uuid())
  userId Int     @unique
  user   User    @relation(fields: [userId], references: [id])
  bio    String?
}`,
    decisions: () => [
      {
        kind: 'column-dropped',
        modelName: 'User',
        field: 'bio',
        choice: 'move',
        value: 'Profile.bio',
      },
      {
        kind: 'column-dropped',
        modelName: 'Post',
        field: 'authorName',
        choice: 'move',
        value: 'User.authorName',
      },
    ],
    rows: (q) => [
      `INSERT INTO ${q('User')} (${q('id')}, ${q('bio')}) VALUES (1, 'Analyst'), (2, NULL), (3, 'Writer')`,
      `INSERT INTO ${q('Post')} (${q('id')}, ${q('authorName')}, ${q('authorId')}) VALUES (1, NULL, 1), (2, 'Zed', 1), (3, 'Ada', 1), (4, 'Bob', 2)`,
    ],
    fixes: [
      ['User.authorName', 3],
      ['Profile.bio', 2],
    ],
    after: [
      {
        sql: (q) => `SELECT ${q('id')}, ${q('authorName')} FROM ${q('User')} ORDER BY ${q('id')}`,
        rows: [
          ['1', 'Zed'],
          ['2', 'Bob'],
          ['3', null],
        ],
      },
      {
        sql: (q) =>
          `SELECT ${q('userId')}, ${q('bio')} FROM ${q('Profile')} ORDER BY ${q('userId')}`,
        rows: [
          ['1', 'Analyst'],
          ['3', 'Writer'],
        ],
      },
    ],
  },
]

/** The comment lines of a script, in order. */
function commentsOf(sql: string) {
  return sql
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('--'))
}

/** Every value as text, NULL as null: the drivers hand numbers back as numbers or as strings. */
function asText(rows: readonly Row[]) {
  return rows.map((row) =>
    Object.values(row).map((value) => {
      if (value === null || value === undefined) return null
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
        return String(value)
      }
      return JSON.stringify(value)
    }),
  )
}

for (const target of TARGETS) {
  describe.skipIf(target.url === undefined)(`migration scenarios on ${target.dialect}`, () => {
    const base = target.url ?? ''
    const q: Quote = (name) => (target.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
    const state = { dir: '' }

    beforeAll(() => {
      state.dir = workspace(`hekireki-scenario-${target.dialect}-`)
    })

    afterAll(async () => {
      if (target.dialect !== 'sqlite') {
        // Every scenario's database, and the one two migrations run one after the other in.
        await Promise.all(
          [...SCENARIOS.map((scenario) => scenario.name), 'chained'].map((name) =>
            target.drop(base, `${RUN}_${name}`),
          ),
        )
      }
      if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
    })

    /**
     * One migration, from the schema in place to the next: Prisma writes it, the check has to
     * pass with the decisions, the plan writes the whole of it, it runs, and the
     * database has to end up as the new schema says.
     */
    async function migrate(input: {
      readonly work: string
      readonly url: string
      readonly name: string
      readonly old: string
      readonly next: string
      readonly decisions: readonly Decision[]
      readonly fixes?: readonly (readonly [string, number])[]
    }) {
      const { work, url, name } = input
      mkdirSync(work, { recursive: true })
      const datasource = `datasource db {\n  provider = "${target.dialect}"\n}\n\n`
      writeFileSync(join(work, 'old.prisma'), `${datasource}${input.old}\n`)
      writeFileSync(join(work, 'new.prisma'), `${datasource}${input.next}\n`)
      decide(work, input.decisions)
      const written = diff(work, url, [
        '--from-schema',
        '../old.prisma',
        '--to-schema',
        '../new.prisma',
        '--script',
      ])
      expect({ status: written.status, out: written.out }).toMatchObject({ status: 0 })
      const migration = written.stdout
        .split('\n')
        .filter((line) => !line.startsWith('Loaded Prisma config'))
        .join('\n')
      writeFileSync(join(work, 'migration.sql'), migration)

      const checked = run(
        'node',
        [cli, 'migrate', 'check', '--schema', 'new.prisma', '--url', url, '--json'],
        work,
      )
      expect({ status: checked.status, out: checked.out }).toMatchObject({ status: 0 })
      if (input.fixes !== undefined) {
        const report: {
          readonly fixes: readonly { readonly subject: string; readonly rows: number }[]
        } = JSON.parse(checked.stdout)
        expect(report.fixes.map((fix) => [fix.subject, fix.rows])).toStrictEqual(input.fixes)
      }

      const planned = run(
        'node',
        [
          cli,
          'migrate',
          'plan',
          '--schema',
          'new.prisma',
          '--url',
          url,
          '-m',
          'migration.sql',
          '-o',
          'plan.sql',
        ],
        work,
      )
      expect({ status: planned.status, out: planned.out }).toMatchObject({ status: 0 })
      const plan = readFileSync(join(work, 'plan.sql'), 'utf8')
      // Prisma's comments where they were, and none added but the marker.
      expect(commentsOf(plan)).toStrictEqual(['-- hekireki migrate plan', ...commentsOf(migration)])
      if (target.dialect === 'postgresql') {
        expect(plan).toMatch(/^DO \$hekireki\$$/mu)
      }
      await target.exec(url, name, plan)
      const drift = diff(work, url, [
        '--from-config-datasource',
        '--to-schema',
        '../new.prisma',
        '--exit-code',
      ])
      expect({ status: drift.status, out: drift.out }).toMatchObject({ status: 0 })
    }

    for (const scenario of SCENARIOS) {
      it(`carries ${scenario.name} through the check, the plan and the migration`, async () => {
        const name = `${RUN}_${scenario.name}`
        const work = join(state.dir, scenario.name)
        mkdirSync(work, { recursive: true })
        const url = target.isolate(base, name, work)
        const datasource = `datasource db {\n  provider = "${target.dialect}"\n}\n\n`
        writeFileSync(join(work, 'old.prisma'), `${datasource}${scenario.old}\n`)
        const pushed = run(prisma, ['db', 'push', '--schema', 'old.prisma', '--url', url], work)
        expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
        await target.exec(url, name, scenario.rows(q).join(';\n'))
        await migrate({
          work,
          url,
          name,
          old: scenario.old,
          next: scenario.next,
          decisions: scenario.decisions(target.dialect),
          fixes: scenario.fixes,
        })
        const found = await Promise.all(
          scenario.after.map(async (query) => asText(await target.rows(url, name, query.sql(q)))),
        )
        expect(found).toStrictEqual(scenario.after.map((query) => query.rows))
      })
    }

    // Migrations come one after another, and the second reads the database the first left: the
    // rows a fix made, the columns it renamed, the members an enum gained.
    it('carries a second migration over the database the first one left', async () => {
      const name = `${RUN}_chained`
      const url = target.isolate(base, name, state.dir)
      const first = join(state.dir, 'chained-1')
      const second = join(state.dir, 'chained-2')
      const v1 = `enum Plan {
  FREE
  TRIAL
  PAID
}

model Account {
  id      Int    @id
  owner   String
  plan    Plan
  seats   String?
}`
      const v2 = `enum Plan {
  FREE
  TRIAL
  PAID
}

model Account {
  id        Int    @id
  ownerName String
  plan      Plan
  seats     Int?
}`
      const v3 = `enum Plan {
  FREE
  PAID
  TEAM
}

model Account {
  id        Int    @id
  ownerName String @unique
  plan      Plan
  seats     Int?
  slug      String @unique
}`
      mkdirSync(first, { recursive: true })
      writeFileSync(
        join(first, 'v1.prisma'),
        `datasource db {\n  provider = "${target.dialect}"\n}\n\n${v1}\n`,
      )
      const pushed = run(prisma, ['db', 'push', '--schema', 'v1.prisma', '--url', url], first)
      expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
      await target.exec(
        url,
        name,
        [
          `INSERT INTO ${q('Account')} (${q('id')}, ${q('owner')}, ${q('plan')}, ${q('seats')}) VALUES (1, 'ann', 'FREE', '3')`,
          `INSERT INTO ${q('Account')} (${q('id')}, ${q('owner')}, ${q('plan')}, ${q('seats')}) VALUES (2, 'bo', 'TRIAL', '')`,
          `INSERT INTO ${q('Account')} (${q('id')}, ${q('owner')}, ${q('plan')}, ${q('seats')}) VALUES (3, 'ann', 'PAID', '12')`,
        ].join(';\n'),
      )

      // The column is renamed and its values converted.
      await migrate({
        work: first,
        url,
        name,
        old: v1,
        next: v2,
        decisions: [
          {
            kind: 'column-dropped',
            modelName: 'Account',
            field: 'owner',
            choice: 'rename',
            value: 'ownerName',
          },
          {
            kind: 'column-type',
            modelName: 'Account',
            field: 'seats',
            choice: 'sql',
            value: SQL.toInt(target.dialect, 'seats'),
          },
        ],
      })

      // And on the database that left: a member of the enum goes, the names turn unique, and a
      // required column is added and filled.
      await migrate({
        work: second,
        url,
        name,
        old: v2,
        next: v3,
        decisions: [
          { kind: 'enum', modelName: 'Account', field: 'plan', choice: 'map', value: 'TRIAL=TEAM' },
          {
            kind: 'unique',
            modelName: 'Account',
            field: 'ownerName',
            choice: 'keep-first-delete',
            value: 'id',
          },
          {
            kind: 'column-added',
            modelName: 'Account',
            field: 'slug',
            choice: 'sql',
            value: SQL.prefixed(target.dialect, 'a-', 'id'),
          },
        ],
        // SQLite holds an enum as text, so the mapping runs before the migration, with the other
        // columns; elsewhere the migration's own cast carries it, after the duplicates.
        fixes:
          target.dialect === 'sqlite'
            ? [
                ['Account.plan', 1],
                ['Account.ownerName', 1],
                ['Account.slug', 2],
              ]
            : [
                ['Account.ownerName', 1],
                ['Account.plan', 1],
                ['Account.slug', 2],
              ],
      })
      expect(
        asText(
          await target.rows(
            url,
            name,
            `SELECT ${q('id')}, ${q('ownerName')}, ${q('plan')}, ${q('seats')}, ${q('slug')} FROM ${q('Account')} ORDER BY ${q('id')}`,
          ),
        ),
      ).toStrictEqual([
        ['1', 'ann', 'FREE', '3', 'a-1'],
        ['2', 'bo', 'TEAM', null, 'a-2'],
      ])
    })
  })
}
