import { describe, expect, it } from 'vite-plus/test'

import {
  makeHistoryStatus,
  makeMigrationsPath,
  migrationRecordStatements,
  withLockfile,
} from './history.js'

describe('makeMigrationsPath', () => {
  it('reads the path prisma.config.ts gives the migrations, and nothing else', () => {
    expect(
      makeMigrationsPath(
        "export default defineConfig({ schema: 'prisma/schema.prisma', migrations: { path: 'db/migrations', seed: 'tsx seed.ts' } })",
      ),
    ).toBe('db/migrations')
    expect(makeMigrationsPath("export default { schema: 'schema.prisma' }")).toBeNull()
    expect(makeMigrationsPath('export default { migrations: { seed: "tsx seed.ts" } }')).toBeNull()
  })
})

describe('withLockfile', () => {
  it('gives a directory with no lock file the provider of the schema, and leaves one that has it', () => {
    const bare = { baseDir: '/m', lockfile: { path: 'migration_lock.toml', content: null } }
    expect(withLockfile(bare, 'sqlite').lockfile.content).toBe('provider = "sqlite"\n')
    const locked = { ...bare, lockfile: { ...bare.lockfile, content: 'provider = "postgresql"\n' } }
    expect(withLockfile(locked, 'sqlite')).toBe(locked)
  })
})

describe('makeHistoryStatus', () => {
  const row = (
    name: string,
    over: Partial<{
      checksum: string
      finishedAt: string | null
      rolledBackAt: string | null
    }> = {},
  ) => ({
    name,
    checksum: 'aaa',
    finishedAt: '2026-01-01T00:00:00.000Z',
    rolledBackAt: null,
    ...over,
  })

  it('sets what the database recorded against the directory, as Prisma reads its history', () => {
    expect(
      makeHistoryStatus({
        present: true,
        applied: [
          row('1_init'),
          row('2_edited', { checksum: 'old' }),
          row('3_failed', { finishedAt: null }),
          // Taken back: deploy runs it again, so it is waiting.
          row('4_rolled', { finishedAt: null, rolledBackAt: '2026-01-02T00:00:00.000Z' }),
          row('0_gone'),
        ],
        directories: [
          { name: '1_init', checksum: 'aaa' },
          { name: '2_edited', checksum: 'new' },
          { name: '3_failed', checksum: 'aaa' },
          { name: '4_rolled', checksum: 'aaa' },
          { name: '5_new', checksum: 'aaa' },
        ],
        hasTables: true,
      }),
    ).toStrictEqual({
      hasMigrationsTable: true,
      pending: ['4_rolled', '5_new'],
      failed: ['3_failed'],
      edited: ['2_edited'],
      divergence: null,
      drift: true,
      missingFiles: ['0_gone'],
      baselineNeeded: false,
    })
  })

  it('asks for a baseline only of a database with tables and no history, and none of an empty one', () => {
    const directories = [{ name: '1_init', checksum: 'aaa' }]
    expect(
      makeHistoryStatus({ present: false, applied: [], directories, hasTables: true })
        .baselineNeeded,
    ).toBe(true)
    expect(
      makeHistoryStatus({ present: false, applied: [], directories, hasTables: false })
        .baselineNeeded,
    ).toBe(false)
  })
})

describe('migrationRecordStatements', () => {
  it('writes the rows Prisma writes, with the placeholders of each database', () => {
    expect(migrationRecordStatements('mysql')).toStrictEqual({
      resolved:
        "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) VALUES (?, ?, CURRENT_TIMESTAMP(3), ?, '', CURRENT_TIMESTAMP(3), 0)",
      started:
        'INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count) VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), 0)',
      finished:
        'UPDATE _prisma_migrations SET finished_at = CURRENT_TIMESTAMP(3), applied_steps_count = 1 WHERE id = ?',
      failed: 'UPDATE _prisma_migrations SET logs = ? WHERE id = ?',
      rolledBack:
        'UPDATE _prisma_migrations SET rolled_back_at = CURRENT_TIMESTAMP(3) WHERE migration_name = ? AND finished_at IS NULL AND rolled_back_at IS NULL',
    })
    expect(migrationRecordStatements('postgresql').rolledBack).toBe(
      'UPDATE _prisma_migrations SET rolled_back_at = now() WHERE migration_name = $1 AND finished_at IS NULL AND rolled_back_at IS NULL',
    )
  })
})
