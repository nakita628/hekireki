import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { cli, decide, prisma, run, TARGETS } from './migrate-harness.ts'

// What Prisma's schema does not describe, read from the catalogue of every database there is: a
// CHECK constraint a fix has to pass, and a trigger its write sets off. The check has to find both
// on a real server, count the rows of a fix the constraint refuses, and the database has to refuse
// that fix in fact. SQLite runs everywhere; the others need the connection strings of
// migrate-harness.ts. CockroachDB is left out: it has no triggers to make before 24.3.

const RUN = `hekireki_unmanaged_${process.pid}_${Date.now()}`

const OLD = `model User {
  id   Int     @id
  name String?
}

model Item {
  id    Int     @id
  score String?
}`

const NEXT = `model User {
  id   Int    @id
  name String
}

model Item {
  id    Int  @id
  score Int?
}`

/** The constraint and the trigger, as each database makes them on the table `prisma db push` made. */
const GUARDS = {
  // SQLite adds no constraint to a table there is: the table is made again with it.
  sqlite: [
    'DROP TABLE "User"',
    `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "name" TEXT CHECK ("name" <> ''))`,
    'CREATE TRIGGER "User_renamed" AFTER UPDATE OF "name" ON "User" BEGIN SELECT 1; END',
  ],
  postgresql: [
    `ALTER TABLE "Item" ADD CONSTRAINT "Item_score_check" CHECK ("score" <> '0')`,
    `ALTER TABLE "User" ADD CONSTRAINT "User_name_check" CHECK ("name" <> '')`,
    'CREATE FUNCTION "hk_noop"() RETURNS trigger AS $body$ BEGIN RETURN NEW; END $body$ LANGUAGE plpgsql',
    'CREATE TRIGGER "User_renamed" BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION "hk_noop"()',
  ],
  mysql: [
    "ALTER TABLE `Item` ADD CONSTRAINT `Item_score_check` CHECK (`score` <> '0')",
    "ALTER TABLE `User` ADD CONSTRAINT `User_name_check` CHECK (`name` <> '')",
    'CREATE TRIGGER `User_renamed` BEFORE UPDATE ON `User` FOR EACH ROW SET NEW.`name` = NEW.`name`',
  ],
}

for (const target of TARGETS) {
  const guards = target.dialect === 'cockroachdb' ? undefined : GUARDS[target.dialect]
  describe.skipIf(target.url === undefined || guards === undefined)(
    `what the schema does not describe on ${target.dialect}`,
    () => {
      const base = target.url ?? ''
      const q = (name: string) => (target.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
      const state = { dir: '', url: '' }

      beforeAll(async () => {
        state.dir = mkdtempSync(join(tmpdir(), `hekireki-unmanaged-${target.dialect}-`))
        mkdirSync(state.dir, { recursive: true })
        state.url = target.isolate(base, RUN, state.dir)
        const datasource = `datasource db {\n  provider = "${target.dialect}"\n}\n\n`
        writeFileSync(join(state.dir, 'old.prisma'), `${datasource}${OLD}\n`)
        writeFileSync(join(state.dir, 'new.prisma'), `${datasource}${NEXT}\n`)
        const pushed = run(
          prisma,
          ['db', 'push', '--schema', 'old.prisma', '--url', state.url],
          state.dir,
        )
        expect({ status: pushed.status, out: pushed.out }).toMatchObject({ status: 0 })
        // One at a time: a trigger's body is not a statement to split a script at.
        await (guards ?? []).reduce(
          (done, sql) => done.then(() => target.exec(state.url, RUN, sql)),
          Promise.resolve(),
        )
        await target.exec(
          state.url,
          RUN,
          `INSERT INTO ${q('User')} (${q('id')}, ${q('name')}) VALUES (1, 'Ann'), (2, NULL)`,
        )
        // '0.0' is not '0' as text, and is 0 as a number: the constraint takes the row now, and
        // refuses what the conversion makes of it.
        await target.exec(
          state.url,
          RUN,
          `INSERT INTO ${q('Item')} (${q('id')}, ${q('score')}) VALUES (1, '7'), (2, '0.0')`,
        )
      })

      afterAll(async () => {
        if (target.dialect !== 'sqlite') await target.drop(base, RUN)
        if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
      })

      /** How the text becomes a number, as each database writes it. */
      const converted =
        target.dialect === 'mysql'
          ? 'CAST(`score` AS SIGNED)'
          : target.dialect === 'postgresql'
            ? 'CAST(CAST("score" AS NUMERIC) AS INTEGER)'
            : 'CAST("score" AS INTEGER)'

      function checked(value: string) {
        decide(state.dir, [
          { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value },
          {
            kind: target.dialect === 'postgresql' ? 'column-recreated' : 'column-type',
            modelName: 'Item',
            field: 'score',
            choice: 'sql',
            value: converted,
          },
        ])
        const result = run(
          'node',
          [cli, 'migrate', 'check', '--schema', 'new.prisma', '--url', state.url, '--json'],
          state.dir,
        )
        const report: {
          readonly checks: readonly {
            readonly kind: string
            readonly subject: string
            readonly status: string
            readonly count: number | null
          }[]
        } = JSON.parse(result.stdout)
        return {
          status: result.status,
          afterMigration: report.checks
            .filter((one) => one.subject.endsWith('(after the migration)'))
            .map((one) => [one.subject, one.status, one.count]),
          found: report.checks
            .filter((one) => !one.subject.endsWith('(after the migration)'))
            .filter((one) => one.kind === 'check-constraint' || one.kind === 'trigger-unfollowed')
            .map((one) => [one.kind, one.status, one.count]),
        }
      }

      it('blocks a fix the CHECK constraint refuses, and the database refuses it in fact', async () => {
        const { status, found } = checked('')
        expect(found).toStrictEqual([
          ['check-constraint', 'blocking', 1],
          ['trigger-unfollowed', 'warning', 1],
        ])
        expect(status).not.toBe(0)
        // SQLite's driver throws as it is called, the others reject: both are a refusal.
        const refused = async () => {
          await target.exec(
            state.url,
            RUN,
            `UPDATE ${q('User')} SET ${q('name')} = '' WHERE ${q('name')} IS NULL`,
          )
        }
        await expect(refused()).rejects.toThrow()
      })

      it('passes a fix the constraint takes, the trigger still said', () => {
        const { status, found } = checked('unknown')
        expect(found).toStrictEqual([
          ['check-constraint', 'passed', 0],
          ['trigger-unfollowed', 'warning', 1],
        ])
        // Where the table keeps its constraints, the one on Item still stops the migration.
        expect(status).toBe(target.dialect === 'sqlite' ? 0 : 1)
      })

      it('asks the constraint again of what the migration makes of the rows, where the table keeps it', async () => {
        const { afterMigration } = checked('unknown')
        if (target.dialect === 'sqlite') {
          // SQLite makes the table again without the constraint: there is nothing to ask.
          expect(afterMigration).toStrictEqual([])
          return
        }
        // MySQL compares the number with the text and finds the one row; PostgreSQL cannot
        // compare an integer with text at all, and refuses the change of type for that.
        expect(afterMigration).toStrictEqual([
          target.dialect === 'mysql'
            ? ['Item Item_score_check (after the migration)', 'blocking', 1]
            : ['Item Item_score_check (after the migration)', 'failed', null],
        ])
        // And it is so: what the migration does to the column is refused.
        const migrated = async () => {
          await target.exec(
            state.url,
            RUN,
            target.dialect === 'mysql'
              ? `UPDATE ${q('Item')} SET ${q('score')} = (${converted})`
              : `ALTER TABLE ${q('Item')} ALTER COLUMN ${q('score')} TYPE INTEGER USING (${converted})`,
          )
        }
        await expect(migrated()).rejects.toThrow()
      })
    },
  )
}
