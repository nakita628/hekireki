import { describe, expect, it } from 'vite-plus/test'

import { makeMigrationsPath, withLockfile } from './history.js'

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
