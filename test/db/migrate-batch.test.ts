import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'

import { cli, decide, prisma, run, statementsOf, TARGETS, workspace } from './migrate-harness.ts'

// `hekireki migrate plan --batch`: a fix over more rows than the batch is written as that many
// rows at a time, and each database names "some of the rows" its own way (a LIMIT on the
// statement, or the rows by where they are stored). Every one of them is run here for real: the
// first statement has to change exactly a batch of rows, and the whole plan every row.

const RUN = `hekireki_batch_${process.pid}_${Date.now()}`

const OLD = `model Event {
  id   Int     @id
  name String?
}

model Tag {
  id    Int     @id
  label String?
}`

const NEXT = `model Event {
  id   Int    @id
  name String
}

model Tag {
  id    Int     @id
  label String? @unique
}`

for (const target of TARGETS) {
  describe.skipIf(target.url === undefined)(`a plan in batches on ${target.dialect}`, () => {
    const base = target.url ?? ''
    const q = (name: string) => (target.dialect === 'mysql' ? `\`${name}\`` : `"${name}"`)
    const state = { dir: '', url: '' }
    const count = async (sql: string) =>
      Number(Object.values((await target.rows(state.url, RUN, sql))[0] ?? {})[0])

    beforeAll(async () => {
      state.dir = workspace(`hekireki-batch-${target.dialect}-`)
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
      // A hook says what went wrong by throwing: an `expect` here is read as a test of its own.
      if (pushed.status !== 0) {
        throw new Error(`prisma db push failed:\n${pushed.out}`)
      }
      // 25 events, 17 of them without a name; 7 tags of one label and one of another.
      const events = Array.from(
        { length: 25 },
        (_, index) => `(${index + 1}, ${index < 17 ? 'NULL' : `'e${index}'`})`,
      )
      const tags = Array.from(
        { length: 8 },
        (_, index) => `(${index + 1}, '${index < 7 ? 'a' : 'b'}')`,
      )
      await target.exec(
        state.url,
        RUN,
        [
          `INSERT INTO ${q('Event')} (${q('id')}, ${q('name')}) VALUES ${events.join(', ')}`,
          `INSERT INTO ${q('Tag')} (${q('id')}, ${q('label')}) VALUES ${tags.join(', ')}`,
        ].join(';\n'),
      )
    })

    afterAll(async () => {
      if (target.dialect !== 'sqlite') await target.drop(base, RUN)
      if (state.dir !== '') rmSync(state.dir, { recursive: true, force: true })
    })

    it('changes a batch of rows with each statement, and every row with the plan', async () => {
      decide(state.dir, [
        { kind: 'not-null', modelName: 'Event', field: 'name', choice: 'value', value: 'unknown' },
        {
          kind: 'unique',
          modelName: 'Tag',
          field: 'label',
          choice: 'keep-first-delete',
          value: null,
        },
      ])
      const planned = run(
        'node',
        [
          cli,
          'migrate',
          'plan',
          '--schema',
          'new.prisma',
          '--url',
          state.url,
          '--batch',
          '5',
          '-o',
          'plan.sql',
        ],
        state.dir,
      )
      expect({ status: planned.status, out: planned.out }).toMatchObject({ status: 0 })
      const statements = statementsOf(readFileSync(join(state.dir, 'plan.sql'), 'utf8'))
      // 17 rows in batches of 5 are four statements and the one that sweeps; 6 duplicates, two and one.
      expect(statements.filter((sql) => sql.includes(q('Event')))).toHaveLength(5)
      expect(statements.filter((sql) => sql.includes(q('Tag')))).toHaveLength(3)

      const nameless = `SELECT COUNT(*) FROM ${q('Event')} WHERE ${q('name')} IS NULL`
      const [first = '', ...rest] = statements
      await target.exec(state.url, RUN, first)
      expect(await count(nameless)).toBe(12)
      await rest.reduce(
        (done, sql) => done.then(() => target.exec(state.url, RUN, sql)),
        Promise.resolve(),
      )
      expect(await count(nameless)).toBe(0)
      expect(await count(`SELECT COUNT(*) FROM ${q('Event')}`)).toBe(25)
      // The first of the seven stays, and the one of another label.
      expect(
        (
          await target.rows(
            state.url,
            RUN,
            `SELECT ${q('id')} FROM ${q('Tag')} ORDER BY ${q('id')}`,
          )
        ).map((row) => Number(Object.values(row)[0])),
      ).toStrictEqual([1, 8])
    })
  })
}
