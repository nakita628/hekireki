import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../../../file/index.js'
import { createStudioApp } from '../app.js'
import { connectDatabase, createStudioState } from '../services/index.js'
import type { disconnectedDatabase } from '../services/index.js'

const dirs: string[] = []
const states: ReturnType<typeof disconnectedDatabase>[] = []

afterEach(async () => {
  await Effect.runPromise(Effect.all(states.splice(0).map((db) => db.close)))
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** The schema the project is going to: `name` is the field the database does not have yet. */
const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
`

/** The migration the project has already run: the table without `name`. */
const INIT_SQL = `-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
`

async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-studio-migrate-'))
  dirs.push(dir)
  const schemaPath = path.join(dir, 'schema.prisma')
  writeFileSync(schemaPath, SCHEMA)
  mkdirSync(path.join(dir, 'migrations', '20260101000000_init'), { recursive: true })
  writeFileSync(path.join(dir, 'migrations', '20260101000000_init', 'migration.sql'), INIT_SQL)
  writeFileSync(path.join(dir, 'migrations', 'migration_lock.toml'), 'provider = "sqlite"\n')
  const state = createStudioState({ schemaPath })
  const snapshot = await Effect.runPromise(Effect.provide(state.reload(), fileSystemLayer))
  const db = await Effect.runPromise(
    Effect.provide(
      connectDatabase({
        explicitUrl: `file:${path.join(dir, 'dev.db')}`,
        configUrl: null,
        configError: null,
        schemaProvider: snapshot.schema?.provider ?? null,
        schemaText: null,
        cwd: dir,
        schemaDir: dir,
        env: {},
      }),
      fileSystemLayer,
    ),
  )
  states.push(db)
  const app = createStudioApp(state, dir, db)
  const call = async (url: string, method: string, body?: unknown) => {
    const response = await app.request(
      url,
      body === undefined
        ? { method }
        : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
    )
    const json: unknown = await response.json()
    return { status: response.status, json }
  }
  return { call, dir }
}

describe('migrate routes over sqlite', () => {
  it('reports the init migration as pending on a database that has never been migrated', async () => {
    const { call } = await setup()
    const { status, json } = await call('/api/migrate', 'GET')
    expect(status).toBe(200)
    expect(json).toMatchObject({
      hasMigrationsTable: false,
      applied: [],
      pending: ['20260101000000_init'],
      failed: [],
      edited: [],
      divergence: null,
      drift: true,
      baselineNeeded: false,
    })
  })

  it('deploys the pending migration, and then only the new field is left to migrate', async () => {
    const { call } = await setup()
    const deployed = await call('/api/migrate/deploy', 'POST')
    expect(deployed.status).toBe(200)
    expect(deployed.json).toStrictEqual({ applied: ['20260101000000_init'] })

    const after = await call('/api/migrate', 'GET')
    expect(after.json).toMatchObject({
      hasMigrationsTable: true,
      pending: [],
      // The schema has `name`; the migration that has run does not.
      drift: true,
    })

    const diff = await call('/api/migrate/diff', 'GET')
    expect(diff.status).toBe(200)
    expect(diff.json).toMatchObject({ drift: true })
    expect((diff.json as { sql: string }).sql).toContain('"name" TEXT')
  })

  it('plans the migration as steps, runs them one at a time and records it', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')

    const planned = await call('/api/migrate/plan', 'POST', { name: 'profile' })
    expect(planned.status).toBe(200)
    const plan = planned.json as {
      name: string
      steps: { title: string; kind: string; statements: string[]; destructive: boolean }[]
      notes: string[]
    }
    expect(plan.name).toMatch(/^\d{14}_profile$/u)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]?.kind).toBe('migration')
    expect(plan.steps[0]?.destructive).toBe(false)
    expect(plan.steps[0]?.statements[0]).toContain('"name" TEXT')

    const created = await call('/api/migrate/migrations', 'POST', {
      name: 'profile',
      sql: plan.steps.flatMap((step) => step.statements.map((sql) => `${sql};`)).join('\n'),
    })
    expect(created.status).toBe(200)
    const { name } = created.json as { name: string; file: string }

    const applied = await call('/api/migrate/apply', 'POST', {
      statements: plan.steps.flatMap((step) => step.statements),
    })
    expect(applied.status).toBe(200)
    expect(applied.json).toMatchObject({ ok: true, failedAt: null })

    const recorded = await call('/api/migrate/migrations/applied', 'POST', { name })
    expect(recorded.status).toBe(200)
    expect(recorded.json).toMatchObject({
      pending: [],
      failed: [],
      edited: [],
      divergence: null,
      // Every step ran, so nothing is left between the database and the schema.
      drift: false,
    })
    expect(
      (recorded.json as { applied: { name: string }[] }).applied.map((one) => one.name),
    ).toStrictEqual(['20260101000000_init', name])
    // The file is still shared: another process reads and writes it with Studio still running.
    const other = new DatabaseSync(path.join(dir, 'dev.db'), { timeout: 0 })
    try {
      expect(() => {
        other.exec('BEGIN IMMEDIATE; ROLLBACK')
      }).not.toThrow()
    } finally {
      other.close()
    }
  })

  it('stops a staged apply at the statement the database refuses', async () => {
    const { call } = await setup()
    await call('/api/migrate/deploy', 'POST')
    const applied = await call('/api/migrate/apply', 'POST', {
      statements: [
        'ALTER TABLE "User" ADD COLUMN "name" TEXT',
        'ALTER TABLE "Nope" ADD COLUMN "x" TEXT',
        'ALTER TABLE "User" ADD COLUMN "never" TEXT',
      ],
    })
    expect(applied.status).toBe(200)
    const result = applied.json as {
      ok: boolean
      failedAt: number | null
      results: { error: string | null }[]
    }
    expect(result.ok).toBe(false)
    expect(result.failedAt).toBe(1)
    expect(result.results).toHaveLength(2)
    expect(result.results[1]?.error).toContain('Nope')
  })
})

describe('resolving a migration that failed', () => {
  it('records it as rolled back, and the history stops calling it failed', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')

    // A migration the database refuses half way: the table is made, then a statement it cannot run.
    const broken = '20260201000000_broken'
    mkdirSync(path.join(dir, 'migrations', broken), { recursive: true })
    writeFileSync(
      path.join(dir, 'migrations', broken, 'migration.sql'),
      'CREATE TABLE "Half" ("id" INTEGER NOT NULL PRIMARY KEY);\nALTER TABLE "Nope" ADD COLUMN "x" TEXT;\n',
    )

    const deployed = await call('/api/migrate/deploy', 'POST')
    expect(deployed.status).toBe(503)

    const failed = await call('/api/migrate', 'GET')
    expect(failed.json).toMatchObject({ failed: [broken] })

    const resolved = await call('/api/migrate/migrations/rolled-back', 'POST', { name: broken })
    expect(resolved.status).toBe(200)
    expect(resolved.json).toMatchObject({ failed: [] })
    // It stays in the history as what happened, with the moment it was rolled back on it.
    const rolled = (
      resolved.json as { applied: { name: string; rolledBackAt: string | null }[] }
    ).applied.find((one) => one.name === broken)
    expect(rolled?.rolledBackAt).not.toBeNull()
  })
})

describe('what the fixes make of the rows', () => {
  it('carries a preview for every model a fix changes, and none without a decision', async () => {
    const { call } = await setup()
    await call('/api/migrate/deploy', 'POST')
    const planned = await call('/api/migrate/plan', 'POST', { name: 'profile' })
    expect(planned.status).toBe(200)
    // Nothing has been decided, so nothing is fixed and nothing is previewed; the
    // field is there either way, which is what the page reads.
    expect(planned.json).toMatchObject({ previews: [] })
  })
})

describe('deciding on the page', () => {
  it('counts the check against the decision, and turns it into a step', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')
    // The column is there and holds nothing, which is the shape a `not-null` check is about.
    await call('/api/db/sql', 'POST', { sql: 'ALTER TABLE "User" ADD COLUMN "name" TEXT' })
    await call('/api/db/sql', 'POST', {
      sql: `INSERT INTO "User" ("email") VALUES ('a@example.com'), ('b@example.com')`,
    })
    // `name` becomes required, and no row has one: without a decision the check blocks and the plan says so.
    writeFileSync(path.join(dir, 'schema.prisma'), SCHEMA.replace('name  String?', 'name  String '))
    await call('/api/schema/reload', 'POST', {})

    const blocked = await call('/api/migrate/plan', 'POST', { name: 'required' })
    expect(blocked.status).toBe(200)
    const before = blocked.json as {
      errors: string[]
      checks: { kind: string; field: string; choices: string[]; status: string }[]
      steps: { kind: string }[]
    }
    const notNull = before.checks.find(
      (check) => check.kind === 'not-null' && check.field === 'name',
    )
    expect(notNull).toMatchObject({ field: 'name', status: 'blocking' })
    expect(notNull?.choices).toContain('value')
    expect(before.errors).toHaveLength(1)
    expect(before.steps.filter((step) => step.kind === 'fix')).toStrictEqual([])

    const decided = await call('/api/migrate/plan', 'POST', {
      name: 'required',
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    })
    expect(decided.status).toBe(200)
    const after = decided.json as {
      errors: string[]
      checks: { kind: string; field: string; status: string }[]
      steps: { kind: string; title: string; rows: number | null }[]
    }
    // Nothing blocks any more, and the decision is a step with the rows it will change on it.
    expect(after.errors).toStrictEqual([])
    const decidedCheck = after.checks.find(
      (check) => check.kind === 'not-null' && check.field === 'name',
    )
    expect(decidedCheck?.status).not.toBe('blocking')
    const fix = after.steps.find((step) => step.kind === 'fix')
    expect(fix?.title).toContain('User.name')
    expect(fix?.rows).toBe(2)
    expect(decidedCheck).not.toHaveProperty('fix')
  })
})

describe('keeping what was decided', () => {
  it('is read on the next plan, with nothing in the request', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')
    await call('/api/db/sql', 'POST', { sql: 'ALTER TABLE "User" ADD COLUMN "name" TEXT' })
    await call('/api/db/sql', 'POST', {
      sql: `INSERT INTO "User" ("email") VALUES ('a@example.com'), ('b@example.com')`,
    })
    writeFileSync(path.join(dir, 'schema.prisma'), SCHEMA.replace('name  String?', 'name  String '))
    await call('/api/schema/reload', 'POST', {})

    // Nothing kept yet, and the page is told where they will be kept.
    const empty = await call('/api/migrate/decisions', 'GET')
    expect(empty.status).toBe(200)
    expect(empty.json).toMatchObject({ decisions: [] })
    expect((empty.json as { file: string }).file).toContain('.hekireki')

    const kept = await call('/api/migrate/decisions', 'PUT', {
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    })
    expect(kept.status).toBe(200)
    expect(kept.json).toMatchObject({
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    })

    // The plan is made with them without being told: they are the setting now.
    const planned = await call('/api/migrate/plan', 'POST', { name: 'required' })
    expect(planned.status).toBe(200)
    const plan = planned.json as {
      errors: string[]
      steps: { kind: string; title: string; rows: number | null }[]
    }
    expect(plan.errors).toStrictEqual([])
    const fix = plan.steps.find((step) => step.kind === 'fix')
    expect(fix?.title).toContain('User.name')
    expect(fix?.rows).toBe(2)

    // Decisions in the request are tried in place of the kept ones: with none, the check blocks.
    const without = await call('/api/migrate/plan', 'POST', { name: 'required', decisions: [] })
    expect((without.json as { errors: string[] }).errors).toHaveLength(1)

    // And they are still there to be read back, which is what the page opens on.
    const again = await call('/api/migrate/decisions', 'GET')
    expect(again.json).toMatchObject({
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    })
  })

  it('keeps a decision whose choice needs no value, and reads it back', async () => {
    const { call } = await setup()
    const unique = {
      kind: 'unique',
      modelName: 'User',
      field: 'email',
      choice: 'keep-first-delete',
    }
    const kept = await call('/api/migrate/decisions', 'PUT', { decisions: [unique] })
    expect(kept.status).toBe(200)
    const read = await call('/api/migrate/decisions', 'GET')
    expect(read.status).toBe(200)
    expect(read.json).toMatchObject({ decisions: [unique] })
  })

  it('forgets a decision that is left out of what is kept', async () => {
    const { call } = await setup()
    await call('/api/migrate/decisions', 'PUT', {
      decisions: [
        { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
      ],
    })
    const emptied = await call('/api/migrate/decisions', 'PUT', { decisions: [] })
    expect(emptied.json).toMatchObject({ decisions: [] })
    expect(await call('/api/migrate/decisions', 'GET')).toMatchObject({
      json: { decisions: [] },
    })
  })
})

describe('baselining a database that has tables and no history', () => {
  it('finds the migration the database matches, refuses the deploy Prisma refuses, and records it', async () => {
    const { call } = await setup()
    // The tables the init migration makes, made some other way: `db push`, or by hand.
    const made = await call('/api/db/sql', 'POST', { sql: INIT_SQL.replaceAll(/^--.*$/gmu, '') })
    expect(made.status).toBe(200)
    await call('/api/db/sql', 'POST', {
      sql: 'CREATE UNIQUE INDEX "User_email_key" ON "User"("email")',
    })

    const before = await call('/api/migrate', 'GET')
    expect(before.json).toMatchObject({ hasMigrationsTable: false, baselineNeeded: true })
    // What `prisma migrate deploy` says of it, reaching the page in its own words.
    const refused = await call('/api/migrate/deploy', 'POST')
    expect(refused.status).toBe(503)
    expect(JSON.stringify(refused.json)).toContain('The database schema is not empty.')

    const candidates = await call('/api/migrate/baseline', 'GET')
    expect(candidates.status).toBe(200)
    expect(candidates.json).toStrictEqual({
      candidates: [{ name: '20260101000000_init', matches: true, difference: '' }],
    })

    const baselined = await call('/api/migrate/baseline', 'POST', { name: '20260101000000_init' })
    expect(baselined.status).toBe(200)
    expect(baselined.json).toMatchObject({
      hasMigrationsTable: true,
      applied: [{ name: '20260101000000_init' }],
      pending: [],
      baselineNeeded: false,
    })
  })

  it('checks a migrations directory with no lock file, as one made by hand has', async () => {
    const { call, dir } = await setup()
    rmSync(path.join(dir, 'migrations', 'migration_lock.toml'))
    await call('/api/db/sql', 'POST', { sql: INIT_SQL.replaceAll(/^--.*$/gmu, '') })
    const candidates = await call('/api/migrate/baseline', 'GET')
    expect(candidates.status).toBe(200)
    expect(candidates.json).toStrictEqual({
      candidates: [{ name: '20260101000000_init', matches: true, difference: '' }],
    })
  })

  it('refuses to record migrations the database does not match, and says what differs', async () => {
    const { call } = await setup()
    await call('/api/db/sql', 'POST', {
      sql: 'CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL, "nickname" TEXT)',
    })

    const candidates = await call('/api/migrate/baseline', 'GET')
    const [init] = (candidates.json as { candidates: { matches: boolean; difference: string }[] })
      .candidates
    expect(init?.matches).toBe(false)
    expect(init?.difference).toContain('nickname')

    const refused = await call('/api/migrate/baseline', 'POST', { name: '20260101000000_init' })
    expect(refused.status).toBe(422)
    expect(JSON.stringify(refused.json)).toContain('nickname')
    const after = await call('/api/migrate', 'GET')
    expect(after.json).toMatchObject({ hasMigrationsTable: false, baselineNeeded: true })
  })
})

describe('recording a migration run a step at a time', () => {
  it('records it on a database that has never been migrated, making _prisma_migrations as Prisma would', async () => {
    const { call } = await setup()
    // The steps of the init migration, run on a database with no history at all.
    const applied = await call('/api/migrate/apply', 'POST', {
      statements: [
        'CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "email" TEXT NOT NULL)',
        'CREATE UNIQUE INDEX "User_email_key" ON "User"("email")',
      ],
    })
    expect(applied.json).toMatchObject({ ok: true })

    const recorded = await call('/api/migrate/migrations/applied', 'POST', {
      name: '20260101000000_init',
    })
    expect(recorded.status).toBe(200)
    expect(recorded.json).toMatchObject({
      hasMigrationsTable: true,
      applied: [{ name: '20260101000000_init' }],
      pending: [],
    })
  })
})

describe('a kept decision the schema no longer has a field for', () => {
  it('is set aside with why, and the plan is made without it', async () => {
    const { call } = await setup()
    await call('/api/migrate/deploy', 'POST')
    await call('/api/migrate/decisions', 'PUT', {
      decisions: [
        { kind: 'column-added', modelName: 'User', field: 'hekireki', choice: 'value', value: '' },
      ],
    })
    const planned = await call('/api/migrate/plan', 'POST', { name: 'stale' })
    expect(planned.status).toBe(200)
    expect(planned.json).toMatchObject({
      unfit: [
        {
          kind: 'column-added',
          modelName: 'User',
          field: 'hekireki',
          choice: 'value',
          value: '',
          reasons: ['User.hekireki: User has no field hekireki.'],
        },
      ],
    })
    // Nothing else stands in the way: the plan is the migration to the new field.
    expect((planned.json as { errors: string[] }).errors).toStrictEqual([])
  })
})

describe('the migrations directory prisma.config.ts names', () => {
  it('is the one the history is read from and a migration is written to', async () => {
    const { call, dir } = await setup()
    writeFileSync(
      path.join(dir, 'prisma.config.ts'),
      "export default { schema: 'schema.prisma', migrations: { path: 'db/migrations' } }\n",
    )
    const status = await call('/api/migrate', 'GET')
    expect(status.json).toMatchObject({
      migrationsDir: path.join(dir, 'db', 'migrations'),
      pending: [],
    })
    const written = await call('/api/migrate/migrations', 'POST', {
      name: 'moved',
      sql: 'CREATE TABLE "Note" ("id" INTEGER NOT NULL PRIMARY KEY);\n',
    })
    expect(
      (written.json as { file: string }).file.startsWith(path.join(dir, 'db', 'migrations')),
    ).toBe(true)
  })
})

describe('the migrations of the directory', () => {
  it('reads the migration.sql of one, and says so when the directory holds no migration of that name', async () => {
    const { call, dir } = await setup()
    const read = await call('/api/migrate/migrations/20260101000000_init', 'GET')
    expect(read.status).toBe(200)
    expect(read.json).toStrictEqual({
      name: '20260101000000_init',
      file: path.join(dir, 'migrations', '20260101000000_init', 'migration.sql'),
      sql: INIT_SQL,
    })
    const missing = await call('/api/migrate/migrations/20260101000000_nope', 'GET')
    expect(missing.status).toBe(404)
  })

  it('lists a migration the database recorded whose directory is gone', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')
    rmSync(path.join(dir, 'migrations', '20260101000000_init'), { recursive: true })
    const status = await call('/api/migrate', 'GET')
    expect(status.json).toMatchObject({
      applied: [{ name: '20260101000000_init' }],
      missingFiles: ['20260101000000_init'],
    })
  })
})

describe('rehearsing a migration', () => {
  it('runs the steps on a copy and leaves the database as it was', async () => {
    const { call } = await setup()
    await call('/api/migrate/deploy', 'POST')
    await call('/api/db/sql', 'POST', {
      sql: `INSERT INTO "User" ("email") VALUES ('a@example.com'), ('b@example.com')`,
    })
    const rehearsed = await call('/api/migrate/rehearse', 'POST', {
      steps: [['ALTER TABLE "User" ADD COLUMN "name" TEXT'], [`UPDATE "User" SET "name" = 'x'`]],
    })
    expect(rehearsed.status).toBe(200)
    expect(rehearsed.json).toStrictEqual({
      ok: true,
      steps: [
        { ran: true, ok: true, affected: 0, error: null, statement: null },
        { ran: true, ok: true, affected: 2, error: null, statement: null },
      ],
      tables: [{ table: 'User', before: 2, after: 2 }],
      schemaMatches: true,
      difference: '',
      limitations: [],
    })
    // The rehearsal ran on a copy: the database still has no `name`.
    const diff = await call('/api/migrate/diff', 'GET')
    expect((diff.json as { sql: string }).sql).toContain('"name" TEXT')
    expect(await call('/api/migrate/tables', 'GET')).toStrictEqual({
      status: 200,
      json: { tables: [{ table: 'User', before: null, after: 2 }] },
    })
  })

  it('reports the statement a step fails at, and does not run the steps after it', async () => {
    const { call } = await setup()
    await call('/api/migrate/deploy', 'POST')
    const rehearsed = await call('/api/migrate/rehearse', 'POST', {
      steps: [
        ['ALTER TABLE "Nope" ADD COLUMN "x" TEXT'],
        ['ALTER TABLE "User" ADD COLUMN "name" TEXT'],
      ],
    })
    expect(rehearsed.status).toBe(200)
    const result = rehearsed.json as {
      ok: boolean
      steps: { ran: boolean; ok: boolean; error: string | null; statement: string | null }[]
      schemaMatches: boolean
    }
    expect(result.ok).toBe(false)
    expect(result.steps[0]?.error).toContain('Nope')
    expect(result.steps[0]?.statement).toBe('ALTER TABLE "Nope" ADD COLUMN "x" TEXT')
    expect(result.steps[1]).toMatchObject({ ran: false, ok: false })
    expect(result.schemaMatches).toBe(false)
  })
})

describe('backing up before a migration', () => {
  it('takes a backup, lists it, and restores the rows and history a run lost', async () => {
    const { call, dir } = await setup()
    await call('/api/migrate/deploy', 'POST')
    await call('/api/db/sql', 'POST', {
      sql: `INSERT INTO "User" ("email") VALUES ('a@example.com')`,
    })
    expect(await call('/api/migrate/backups', 'GET')).toStrictEqual({
      status: 200,
      json: { backups: [] },
    })
    const taken = await call('/api/migrate/backups', 'POST')
    expect(taken.status).toBe(200)
    const backup = taken.json as { name: string; location: string; restorable: boolean }
    expect(backup.name).toMatch(/^backup_\d{17}$/u)
    expect(backup.location).toBe(path.join(dir, '.hekireki', 'backups', `${backup.name}.db`))
    expect(backup.restorable).toBe(true)
    const listed = await call('/api/migrate/backups', 'GET')
    expect(
      (listed.json as { backups: { name: string }[] }).backups.map((one) => one.name),
    ).toStrictEqual([backup.name])

    // A run that loses the rows, and the migration it wrote.
    const created = await call('/api/migrate/migrations', 'POST', {
      name: 'wipe',
      sql: 'DELETE FROM "User";\n',
    })
    const { name } = created.json as { name: string }
    await call('/api/migrate/apply', 'POST', { statements: ['DELETE FROM "User"'] })
    await call('/api/migrate/migrations/applied', 'POST', { name })

    const restored = await call('/api/migrate/backups/restore', 'POST', {
      name: backup.name,
      migration: name,
    })
    expect(restored.status).toBe(200)
    expect(restored.json).toMatchObject({ applied: [{ name: '20260101000000_init' }], pending: [] })
    expect((restored.json as { applied: unknown[] }).applied).toHaveLength(1)
    expect(await call('/api/migrate/tables', 'GET')).toStrictEqual({
      status: 200,
      json: { tables: [{ table: 'User', before: null, after: 1 }] },
    })
  })

  it('refuses a backup that is not there', async () => {
    const { call } = await setup()
    const missing = await call('/api/migrate/backups/restore', 'POST', {
      name: 'backup_20260101000000000',
    })
    expect(missing.status).toBe(422)
  })
})
