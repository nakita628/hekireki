import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { cli, decide, diff, prisma, run, TARGETS } from './migrate-harness.ts'
import type { Row, Target } from './migrate-harness.ts'

// `hekireki migrate plan --migration` against real databases, held to Prisma itself: the old
// schema's tables come from `prisma db push`, rows go in, Prisma writes the migration to the new
// schema (`prisma migrate diff --script`), the plan rewrites it (a column renamed, a String turned
// Int, an enum value mapped to a new member, a required column added and filled), and the whole
// of it runs. Then `prisma migrate diff --exit-code` has to find no difference between the
// database and the schema, and the rows have to be the ones the decisions asked for. The change drops
// nothing, so running it loses no row. SQLite runs everywhere; PostgreSQL and MySQL need the
// connection strings test/db/seed.test.ts reads and are skipped without them, and CockroachDB
// needs HEKIREKI_SEED_COCKROACH (a database there is made for each run, the way PostgreSQL's
// schema is). Its migration runs as \`prisma migrate deploy\` runs one there: a statement at a
// time, on a session set up the way Prisma's connection sets it (each statement of a batch in its
// own transaction, the declarative schema changer off).
//
// And the cascades: deleting the duplicate of a tree of categories goes down the tree (ON DELETE
// CASCADE on the table itself), into the products (CASCADE) and on to their reviews (SET NULL),
// and the check has to read the rows as the database leaves them after the plan.

/** The SQL of the conversion and the fill, as each dialect spells it, and whether it has enums. */
const DIALECT: Readonly<
  Record<
    Target['dialect'],
    { readonly convert: string; readonly fill: string; readonly enums: boolean }
  >
> = {
  sqlite: { convert: "CAST(NULLIF(views, '') AS INTEGER)", fill: "'t-' || id", enums: false },
  postgresql: { convert: "CAST(NULLIF(views, '') AS INTEGER)", fill: "'t-' || id", enums: true },
  mysql: { convert: "CAST(NULLIF(views, '') AS SIGNED)", fill: "CONCAT('t-', id)", enums: true },
  cockroachdb: {
    convert: "CAST(NULLIF(views, '') AS INT4)",
    fill: "'t-' || id::STRING",
    enums: true,
  },
}

const RUN = `hekireki_rewrite_${process.pid}_${Date.now()}`

function schemas(target: Target) {
  const role = DIALECT[target.dialect].enums
    ? 'Role    @default(VIEWER)'
    : 'String  @default("VIEWER")'
  const old = `datasource db {
  provider = "${target.dialect}"
}
${DIALECT[target.dialect].enums ? '\nenum Role {\n  ADMIN\n  EDITOR\n  VIEWER\n}\n' : ''}
model User {
  id       Int     @id
  nickname String? @unique
  views    String?
  role     ${role}
}
`
  const next = `datasource db {
  provider = "${target.dialect}"
}
${DIALECT[target.dialect].enums ? '\nenum Role {\n  ADMIN\n  VIEWER\n  WRITER\n}\n' : ''}
model User {
  id          Int     @id
  displayName String? @unique
  views       Int?
  role        ${role}
  token       String  @unique @default(uuid())
  score       Int     @default(0)
}
`
  const decisions = [
    {
      kind: 'column-dropped',
      modelName: 'User',
      field: 'nickname',
      choice: 'rename',
      value: 'displayName',
    },
    {
      kind: 'column-type',
      modelName: 'User',
      field: 'views',
      choice: 'sql',
      value: DIALECT[target.dialect].convert,
    },
    ...(DIALECT[target.dialect].enums
      ? [{ kind: 'enum', modelName: 'User', field: 'role', choice: 'map', value: 'EDITOR=WRITER' }]
      : []),
    {
      kind: 'column-added',
      modelName: 'User',
      field: 'token',
      choice: 'sql',
      value: DIALECT[target.dialect].fill,
    },
  ]
  return { old, next, decisions }
}

const TREE = (provider: string) => `datasource db {
  provider = "${provider}"
}

model Category {
  id       Int        @id
  slug     String${provider === 'mysql' ? ' @db.VarChar(20)' : ''}
  parentId Int?
  parent   Category?  @relation("tree", fields: [parentId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  children Category[] @relation("tree")
  products Product[]
}

model Product {
  id         Int      @id
  categoryId Int
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  reviews    Review[]
}

model Review {
  id        Int      @id
  productId Int?
  product   Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
}
`

// ON UPDATE: BRONZE goes from the enum and becomes SILVER in Plan.tier, which Sub.tier follows
// (CASCADE) and Note.subTier loses (SET NULL); in Category, pointing at itself, BRONZE becomes
// IRON, which the child follows where the database lets it. MySQL does not: it refuses an ON
// UPDATE cascade into a table the change has been through.
const TIERS = (provider: string, members: string) => `datasource db {
  provider = "${provider}"
}

enum Tier {
${members}
}

model Plan {
  id   Int   @id
  tier Tier  @unique
  subs Sub[]
}

model Sub {
  id    Int    @id
  tier  Tier   @unique
  plan  Plan   @relation(fields: [tier], references: [tier], onUpdate: Cascade)
  notes Note[]
}

model Note {
  id      Int   @id
  subTier Tier?
  sub     Sub?  @relation(fields: [subTier], references: [tier], onUpdate: SetNull)
}

model Category {
  id         Int        @id
  tier       Tier       @unique
  parentTier Tier?
  parent     Category?  @relation("tree", fields: [parentTier], references: [tier], onUpdate: Cascade)
  children   Category[] @relation("tree")
}
`

for (const target of TARGETS) {
  describe.skipIf(target.url === undefined)(
    `hekireki migrate plan --migration on ${target.dialect}`,
    () => {
      const base = target.url ?? ''
      const state = { dir: '', rewrite: '', tree: '', tiers: '', deploy: '' }

      beforeAll(() => {
        if (target.url === undefined) return
        state.dir = mkdtempSync(join(tmpdir(), `hekireki-rewrite-${target.dialect}-`))
        state.rewrite = target.isolate(base, `${RUN}_rewrite`, state.dir)
        state.tree = target.isolate(base, `${RUN}_tree`, state.dir)
        state.tiers = target.isolate(base, `${RUN}_tiers`, state.dir)
        state.deploy = target.isolate(base, `${RUN}_deploy`, state.dir)
      })

      afterAll(async () => {
        if (target.url !== undefined && target.dialect !== 'sqlite') {
          await target.drop(base, `${RUN}_rewrite`)
          await target.drop(base, `${RUN}_tree`)
          await target.drop(base, `${RUN}_tiers`)
          await target.drop(base, `${RUN}_deploy`)
        }
        if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
      })

      it('rewrites the migration Prisma wrote so the database ends up as the schema, the rows as the decisions say', async () => {
        const { dir } = state
        const { old, next, decisions } = schemas(target)
        writeFileSync(join(dir, 'old.prisma'), old)
        writeFileSync(join(dir, 'new.prisma'), next)
        decide(dir, decisions)
        const pushed = run(
          prisma,
          ['db', 'push', '--schema', 'old.prisma', '--url', state.rewrite],
          dir,
        )
        expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
        await target.exec(
          state.rewrite,
          `${RUN}_rewrite`,
          `INSERT INTO ${target.dialect === 'mysql' ? '`User`' : '"User"'} (id, nickname, views, role) VALUES (1, 'ann', '10', 'ADMIN'), (2, 'bob', '', '${DIALECT[target.dialect].enums ? 'EDITOR' : 'VIEWER'}'), (3, NULL, NULL, 'VIEWER')`,
        )
        const written = diff(dir, state.rewrite, [
          '--from-schema',
          '../old.prisma',
          '--to-schema',
          '../new.prisma',
          '--script',
        ])
        expect({ status: written.status, out: written.out }).toMatchObject({ status: 0 })
        writeFileSync(
          join(dir, 'migration.sql'),
          written.stdout
            .split('\n')
            .filter((line) => !line.startsWith('Loaded Prisma config'))
            .join('\n'),
        )
        const checked = run(
          'node',
          [cli, 'migrate', 'check', '--schema', 'new.prisma', '--url', state.rewrite],
          dir,
        )
        expect({ status: checked.status, out: checked.out }).toMatchObject({ status: 0 })
        const planned = run(
          'node',
          [
            cli,
            'migrate',
            'plan',
            '--schema',
            'new.prisma',
            '--url',
            state.rewrite,
            '-m',
            'migration.sql',
            '-o',
            'full.sql',
          ],
          dir,
        )
        expect({ status: planned.status, out: planned.out }).toMatchObject({ status: 0 })
        await target.exec(
          state.rewrite,
          `${RUN}_rewrite`,
          readFileSync(join(dir, 'full.sql'), 'utf8'),
        )
        const drift = diff(dir, state.rewrite, [
          '--from-config-datasource',
          '--to-schema',
          '../new.prisma',
          '--exit-code',
        ])
        expect({ status: drift.status, out: drift.out }).toMatchObject({ status: 0 })
        const users = await target.rows(
          state.rewrite,
          `${RUN}_rewrite`,
          `SELECT ${target.dialect === 'mysql' ? '`displayName`, `views`, `role`, `token`' : '"displayName", "views", "role", "token"'} FROM ${target.dialect === 'mysql' ? '`User`' : '"User"'} ORDER BY id`,
        )
        expect(
          users.map((u) => [
            u.displayName,
            u.views === null ? null : Number(u.views),
            u.role,
            u.token,
          ]),
        ).toStrictEqual([
          ['ann', 10, 'ADMIN', 't-1'],
          ['bob', null, DIALECT[target.dialect].enums ? 'WRITER' : 'VIEWER', 't-2'],
          [null, null, 'VIEWER', 't-3'],
        ])
      })

      it.skipIf(target.dialect === 'sqlite')(
        "reads the rows as the database's cascades leave them, down a tree and into the tables that point at it",
        async () => {
          const { dir } = state
          const q = (name: string) => (target.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
          writeFileSync(join(dir, 'tree-old.prisma'), TREE(target.dialect))
          writeFileSync(
            join(dir, 'tree-new.prisma'),
            TREE(target.dialect).replace(
              /slug {5}String(?: @db.VarChar\(20\))?/u,
              (slug) => `${slug} @unique`,
            ),
          )
          const tree = join(dir, 'tree')
          mkdirSync(tree, { recursive: true })
          decide(tree, [
            {
              kind: 'unique',
              modelName: 'Category',
              field: 'slug',
              choice: 'keep-first-delete',
              value: null,
            },
          ])
          const pushed = run(
            prisma,
            ['db', 'push', '--schema', 'tree-old.prisma', '--url', state.tree],
            dir,
          )
          expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
          await target.exec(
            state.tree,
            `${RUN}_tree`,
            [
              `INSERT INTO ${q('Category')} VALUES (1, 'a', NULL), (2, 'a', NULL), (3, 'b', 2), (4, 'c', 3), (5, 'd', 1)`,
              `INSERT INTO ${q('Product')} VALUES (1, 1), (2, 2), (3, 4), (4, 5)`,
              `INSERT INTO ${q('Review')} VALUES (1, 1), (2, 2), (3, 3), (4, NULL)`,
            ].join(';\n'),
          )
          const checked = run(
            'node',
            [
              cli,
              'migrate',
              'check',
              '--schema',
              '../tree-new.prisma',
              '--decisions',
              '.hekireki/migrate.json',
              '--url',
              state.tree,
              '--json',
            ],
            tree,
          )
          expect({ status: checked.status, out: checked.out }).toMatchObject({ status: 0 })
          const report: {
            readonly checks: readonly Row[]
            readonly previews: readonly { readonly model: string; readonly sql: string }[]
            readonly plan: string
          } = JSON.parse(checked.stdout)
          expect(
            report.checks
              .filter((c) => String(c.kind).startsWith('delete-'))
              .map((c) => [c.status, c.subject, c.count]),
          ).toStrictEqual([
            ['warning', 'Category.parentId → Category.slug', 2],
            ['warning', 'Product.categoryId → Category.slug', 2],
            ['warning', 'Review.productId → Product.categoryId → Category.slug', 2],
          ])
          const predicted = await Promise.all(
            report.previews.map(async (preview) => [
              preview.model,
              await target.rows(state.tree, `${RUN}_tree`, preview.sql),
            ]),
          )
          await target.exec(state.tree, `${RUN}_tree`, report.plan)
          const after = await Promise.all(
            report.previews.map(async (preview) => [
              preview.model,
              await target.rows(
                state.tree,
                `${RUN}_tree`,
                `SELECT * FROM ${q(preview.model)} ORDER BY ${q('id')}`,
              ),
            ]),
          )
          expect(predicted).toStrictEqual(after)
          expect(
            after.map(([model, rows]) => [model, Array.isArray(rows) ? rows.length : 0]),
          ).toStrictEqual([
            ['Category', 2],
            ['Product', 2],
            ['Review', 4],
          ])
        },
      )

      it.skipIf(target.dialect === 'sqlite')(
        'reads the rows as ON UPDATE CASCADE and SET NULL leave them, and says where MySQL refuses the cascade',
        async () => {
          const { dir } = state
          const q = (name: string) => (target.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
          writeFileSync(
            join(dir, 'tiers-old.prisma'),
            TIERS(target.dialect, '  GOLD\n  SILVER\n  BRONZE\n  IRON'),
          )
          writeFileSync(
            join(dir, 'tiers-new.prisma'),
            TIERS(target.dialect, '  GOLD\n  SILVER\n  IRON'),
          )
          const tiers = join(dir, 'tiers')
          mkdirSync(tiers, { recursive: true })
          decide(tiers, [
            {
              kind: 'enum',
              modelName: 'Plan',
              field: 'tier',
              choice: 'map',
              value: 'BRONZE=SILVER',
            },
            {
              kind: 'enum',
              modelName: 'Category',
              field: 'tier',
              choice: 'map',
              value: 'BRONZE=IRON',
            },
          ])
          const pushed = run(
            prisma,
            ['db', 'push', '--schema', 'tiers-old.prisma', '--url', state.tiers],
            dir,
          )
          expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
          await target.exec(
            state.tiers,
            `${RUN}_tiers`,
            [
              `INSERT INTO ${q('Plan')} VALUES (1, 'GOLD'), (2, 'BRONZE')`,
              `INSERT INTO ${q('Sub')} VALUES (1, 'BRONZE'), (2, 'GOLD')`,
              `INSERT INTO ${q('Note')} VALUES (1, 'BRONZE'), (2, 'GOLD'), (3, NULL)`,
              `INSERT INTO ${q('Category')} VALUES (1, 'GOLD', NULL), (2, 'BRONZE', 'GOLD'), (3, 'SILVER', 'BRONZE')`,
            ].join(';\n'),
          )
          const checked = run(
            'node',
            [
              cli,
              'migrate',
              'check',
              '--schema',
              '../tiers-new.prisma',
              '--decisions',
              '.hekireki/migrate.json',
              '--url',
              state.tiers,
              '--json',
            ],
            tiers,
          )
          const report: {
            readonly checks: readonly Row[]
            readonly previews: readonly { readonly model: string; readonly sql: string }[]
            readonly plan: string
          } = JSON.parse(checked.stdout)
          const mysqlRefuses = target.dialect === 'mysql'
          expect(
            report.checks
              .filter((c) => String(c.kind).startsWith('update-'))
              .map((c) => [c.status, c.subject, c.count]),
          ).toStrictEqual([
            ['warning', 'Sub.tier → Plan.tier', 1],
            ['warning', 'Note.subTier → Sub.tier → Plan.tier', 1],
            [mysqlRefuses ? 'blocking' : 'warning', 'Category.parentTier → Category.tier', 1],
          ])
          expect({ status: checked.status, out: checked.out }).toMatchObject({
            status: mysqlRefuses ? 1 : 0,
          })
          if (mysqlRefuses) {
            await expect(target.exec(state.tiers, `${RUN}_tiers`, report.plan)).rejects.toThrow(
              /foreign key constraint fails/u,
            )
            return
          }
          const predicted = await Promise.all(
            report.previews.map(async (preview) => [
              preview.model,
              await target.rows(state.tiers, `${RUN}_tiers`, preview.sql),
            ]),
          )
          await target.exec(state.tiers, `${RUN}_tiers`, report.plan)
          const after = await Promise.all(
            report.previews.map(async (preview) => [
              preview.model,
              await target.rows(
                state.tiers,
                `${RUN}_tiers`,
                `SELECT * FROM ${q(preview.model)} ORDER BY ${q('id')}`,
              ),
            ]),
          )
          expect(predicted).toStrictEqual(after)
          expect(after).toStrictEqual([
            [
              'Plan',
              [
                { id: 1, tier: 'GOLD' },
                { id: 2, tier: 'SILVER' },
              ],
            ],
            [
              'Sub',
              [
                { id: 1, tier: 'SILVER' },
                { id: 2, tier: 'GOLD' },
              ],
            ],
            [
              'Note',
              [
                { id: 1, subTier: null },
                { id: 2, subTier: 'GOLD' },
                { id: 3, subTier: null },
              ],
            ],
            [
              'Category',
              [
                { id: 1, tier: 'GOLD', parentTier: null },
                { id: 2, tier: 'IRON', parentTier: 'GOLD' },
                { id: 3, tier: 'SILVER', parentTier: 'IRON' },
              ],
            ],
          ])
        },
      )

      // Prisma runs a migration a statement at a time, with no transaction around it; on
      // PostgreSQL the plan is one statement, a DO block, run whole or not at all. Held to
      // `prisma migrate deploy` itself: a plan that fails at its end leaves the database as it
      // was, with the error of the statement that failed, and once Prisma is told the migration
      // rolled back, the plan goes through and leaves the database as the schema.
      it.skipIf(target.dialect !== 'postgresql')(
        'runs as one transaction under prisma migrate deploy, so a failure leaves the database as it was',
        async () => {
          const dir = join(state.dir, 'deploy')
          const migrations = join(dir, 'migrations')
          mkdirSync(join(migrations, '0_init'), { recursive: true })
          const { old, next, decisions } = schemas(target)
          writeFileSync(join(dir, 'old.prisma'), old)
          writeFileSync(join(dir, 'new.prisma'), next)
          decide(dir, decisions)
          writeFileSync(join(migrations, 'migration_lock.toml'), 'provider = "postgresql"\n')
          const prismaConfig = (schema: string) =>
            writeFileSync(
              join(dir, 'prisma.config.ts'),
              `export default { schema: '${schema}', migrations: { path: 'migrations' }, datasource: { url: ${JSON.stringify(state.deploy)} } }\n`,
            )
          const script = (args: readonly string[]) => {
            const result = run(prisma, ['migrate', 'diff', ...args, '--script'], dir)
            expect({ status: result.status, out: result.out }).toMatchObject({ status: 0 })
            return result.stdout
              .split('\n')
              .filter((line) => !line.startsWith('Loaded Prisma config'))
              .join('\n')
          }
          prismaConfig('old.prisma')
          writeFileSync(
            join(migrations, '0_init', 'migration.sql'),
            script(['--from-empty', '--to-schema', 'old.prisma']),
          )
          const initialized = run(prisma, ['migrate', 'deploy'], dir)
          expect({ status: initialized.status, out: initialized.out }).toMatchObject({ status: 0 })
          await target.exec(
            state.deploy,
            `${RUN}_deploy`,
            `INSERT INTO "User" (id, nickname, views, role) VALUES (1, 'ann', '10', 'ADMIN'), (2, 'bob', '', 'EDITOR'), (3, NULL, NULL, 'VIEWER')`,
          )
          writeFileSync(
            join(dir, 'prisma-migration.sql'),
            script(['--from-schema', 'old.prisma', '--to-schema', 'new.prisma']),
          )
          const planned = run(
            'node',
            [
              cli,
              'migrate',
              'plan',
              '--schema',
              'new.prisma',
              '--url',
              state.deploy,
              '-m',
              'prisma-migration.sql',
              '-o',
              'plan.sql',
            ],
            dir,
          )
          expect({ status: planned.status, out: planned.out }).toMatchObject({ status: 0 })
          const plan = readFileSync(join(dir, 'plan.sql'), 'utf8')
          expect(plan).toMatch(/^DO \$hekireki\$$/mu)
          expect(plan.trimEnd().endsWith('END $hekireki$;')).toBe(true)
          const before = await target.rows(
            state.deploy,
            `${RUN}_deploy`,
            'SELECT * FROM "User" ORDER BY id',
          )

          // The whole plan runs, then fails at its end: a required column no row has a value for.
          mkdirSync(join(migrations, '1_change'))
          writeFileSync(
            join(migrations, '1_change', 'migration.sql'),
            plan.replace(
              /END \$hekireki\$;\s*$/u,
              'ALTER TABLE "User" ADD COLUMN "missing" INTEGER NOT NULL;\n\nEND $hekireki$;\n',
            ),
          )
          prismaConfig('new.prisma')
          const failed = run(prisma, ['migrate', 'deploy'], dir)
          expect(failed.status).not.toBe(0)
          expect(failed.out).toMatch(/column "missing" of relation "User" contains null values/u)
          expect(
            await target.rows(state.deploy, `${RUN}_deploy`, 'SELECT * FROM "User" ORDER BY id'),
          ).toStrictEqual(before)

          const resolved = run(prisma, ['migrate', 'resolve', '--rolled-back', '1_change'], dir)
          expect({ status: resolved.status, out: resolved.out }).toMatchObject({ status: 0 })
          writeFileSync(join(migrations, '1_change', 'migration.sql'), plan)
          const deployed = run(prisma, ['migrate', 'deploy'], dir)
          expect({ status: deployed.status, out: deployed.out }).toMatchObject({ status: 0 })
          const drift = run(
            prisma,
            [
              'migrate',
              'diff',
              '--from-config-datasource',
              '--to-schema',
              'new.prisma',
              '--exit-code',
            ],
            dir,
          )
          expect({ status: drift.status, out: drift.out }).toMatchObject({ status: 0 })
          expect(
            (
              await target.rows(
                state.deploy,
                `${RUN}_deploy`,
                'SELECT "displayName", "views", "role", "token" FROM "User" ORDER BY id',
              )
            ).map((u) => [u.displayName, u.views, u.role, u.token]),
          ).toStrictEqual([
            ['ann', 10, 'ADMIN', 't-1'],
            ['bob', null, 'WRITER', 't-2'],
            [null, null, 'VIEWER', 't-3'],
          ])
        },
      )
    },
  )
}
