import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { NodeFileSystem, NodeServices } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import { CliError } from 'effect/unstable/cli'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { DEFAULT_SCHEMA_PATHS } from './constants.js'
import { hekirekiCli, resolveSchemaPath, studioBanner } from './index.js'

const dirs: string[] = []
const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

/** The sentence a failure carries, whichever of the two shapes `resolveSchemaPath` answered with. */
function userMessageOf(error: unknown): string {
  if (error instanceof CliError.ShowHelp) return userMessageOf(error.errors[0])
  // What the CLI prints of it.
  return error instanceof CliError.UserError ? error.message : String(error)
}

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-cli-'))
  dirs.push(dir)
  return dir
}

/**
 * Runs the CLI exactly as `dist/bin/hekireki.js` does — same entry, same platform services — with
 * `console` recorded. Help, errors and the banner all go through it, so this captures everything
 * a user would see; `printed` is the pair, for the messages the runner may put on either stream.
 */
async function cli(args: readonly string[]) {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    out.push(parts.map(String).join(' '))
  })
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    err.push(parts.map(String).join(' '))
  })
  const exit = await Effect.runPromiseExit(
    hekirekiCli(args, { version: '0.0.0-test' }).pipe(Effect.provide(NodeServices.layer)),
  )
  return {
    exit,
    out: out.join('\n'),
    err: err.join('\n'),
    printed: [...out, ...err].join('\n'),
  }
}

describe('hekireki --help', () => {
  it('lists the studio subcommand', async () => {
    const { exit, out } = await cli(['--help'])
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(out).toContain('USAGE')
    expect(out).toContain('hekireki <subcommand>')
    expect(out).toContain('studio')
    expect(out).toContain('migrate')
  })

  it('prints the version', async () => {
    const { out } = await cli(['--version'])
    expect(out).toContain('0.0.0-test')
  })

  it('rejects an unknown subcommand, `docs` among them now that Studio serves the docs page', async () => {
    const unknown = await cli(['wat'])
    expect(Exit.isFailure(unknown.exit)).toBe(true)
    expect(unknown.err).toContain('Unknown subcommand "wat"')
    const docs = await cli(['docs', 'serve'])
    expect(Exit.isFailure(docs.exit)).toBe(true)
    expect(docs.err).toContain('Unknown subcommand "docs"')
  })
})

describe('hekireki help', () => {
  // `help` is not a command of the CLI: Effect's runner renders the document and fails, where
  // the flag it stands for succeeds.
  it('prints what --help prints, and fails as no command of its own', async () => {
    const help = await cli(['help'])
    const flag = await cli(['--help'])
    expect(help.out).toBe(flag.out)
    expect(Exit.isSuccess(help.exit)).toBe(false)
    expect(Exit.isSuccess(flag.exit)).toBe(true)
  })

  // Effect's CLI explains the command it has read so far, so `help` after one explains it.
  it('explains the command it follows, and the root command before one', async () => {
    const studio = await cli(['studio', '--help'])
    const after = await cli(['studio', 'help'])
    expect(after.out).toBe(studio.out)
    const root = await cli(['--help'])
    const before = await cli(['help', 'studio'])
    expect(before.out).toBe(root.out)
  })

  it('leaves a flag value that reads `help` alone', async () => {
    const { printed } = await cli(['studio', '--schema', 'help'])
    expect(printed).toContain('Schema not found: help')
  })
})

describe('hekireki studio', () => {
  it('documents the schema, url and port flags', async () => {
    const { out } = await cli(['studio', '--help'])
    expect(out).toContain('--port, -p')
    expect(out).toContain('--schema, -s')
    expect(out).toContain('--url, -u')
    expect(out).toContain('prisma/schema.prisma')
  })

  it('rejects a port that is not a number', async () => {
    const { exit, err } = await cli(['studio', '-p', 'abc'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(err).toContain('Invalid value for flag --port')
  })

  it('reports a missing explicit schema', async () => {
    const { exit, err } = await cli(['studio', '--schema', '/nowhere/schema.prisma'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(err).toContain('Schema not found: /nowhere/schema.prisma')
    expect(err).toContain('Check the path passed to --schema')
  })

  it('explains where it looked when no default schema exists, with the usage block', async () => {
    process.chdir(tmp())
    const { exit, printed } = await cli(['studio'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain(
      'No Prisma schema found (looked for prisma/schema.prisma, schema.prisma)',
    )
    // Nothing was typed out, so the usage of the command that was run is the answer.
    expect(printed).toContain('hekireki studio [flags]')
  })

  it('rejects a port outside the range a listener can bind', async () => {
    const { exit, printed } = await cli(['studio', '-p', '70000'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('--port')
  })

  it('rejects a database URL Studio has no driver for', async () => {
    const { exit, printed } = await cli(['studio', '--url', 'redis://localhost'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('a postgres://, postgresql://, mysql:// or file: connection string')
  })

  it('lists the examples in its help', async () => {
    const { out } = await cli(['studio', '--help'])
    expect(out).toContain('hekireki studio --schema prisma/schema')
    expect(out).toContain('hekireki studio --url file:./dev.db')
  })

  // Both values are read by a schema, so "accepted" means the command got past parsing and on to
  // the schema it could not find — not that it started a server.
  it.each(['file:./dev.db', 'postgres://localhost/app', 'postgresql://localhost/app', 'mysql://x'])(
    'takes %s as a database URL',
    async (url) => {
      process.chdir(tmp())
      const { printed } = await cli(['studio', '--url', url])
      expect(printed).not.toContain('Invalid value for flag --url')
      expect(printed).toContain('No Prisma schema found')
    },
  )

  it.each(['1', '65535'])('takes port %s', async (port) => {
    process.chdir(tmp())
    const { printed } = await cli(['studio', '-p', port])
    expect(printed).not.toContain('Invalid value for flag --port')
    expect(printed).toContain('No Prisma schema found')
  })

  it.each(['0', '65536', '1.5'])('rejects port %s', async (port) => {
    const { exit, printed } = await cli(['studio', '-p', port])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('Invalid value for flag --port')
  })

  it('says which port is taken, and how to pick another', async () => {
    const dir = tmp()
    process.chdir(dir)
    writeFileSync(
      path.join(dir, 'schema.prisma'),
      'datasource db {\n  provider = "sqlite"\n}\n\nmodel User {\n  id Int @id\n}\n',
    )
    const taken = createServer()
    await new Promise<void>((resolve) => {
      taken.listen(0, '127.0.0.1', resolve)
    })
    const address = taken.address()
    const port = address !== null && typeof address === 'object' ? address.port : 0
    try {
      const { exit, printed } = await cli(['studio', '-p', String(port)])
      expect(Exit.isFailure(exit)).toBe(true)
      expect(printed).toContain(`Port ${port} is already in use`)
      expect(printed).toContain('Pass -p <port> to use another port')
    } finally {
      taken.close()
    }
  })
})

describe('hekireki seed', () => {
  it('documents its flags and examples', async () => {
    const { exit, out } = await cli(['seed', '--help'])
    expect(Exit.isSuccess(exit)).toBe(true)
    for (const flag of [
      '--config',
      '--schema',
      '--url',
      '--sql',
      '--seed',
      '--count',
      '--locale',
      '--reset',
    ]) {
      expect(out).toContain(flag)
    }
    expect(out).toContain('hekireki seed --sql prisma/seed.sql')
  })

  it('is listed beside studio', async () => {
    const { out } = await cli(['--help'])
    expect(out).toContain('seed')
  })

  it('rejects a database URL it has no driver for and a seed that is not a number', async () => {
    const bad = await cli(['seed', '--url', 'mongodb://localhost/app'])
    expect(Exit.isFailure(bad.exit)).toBe(true)
    expect(bad.printed).toContain(
      'a postgres://, postgresql://, mysql:// or file: connection string',
    )
    const seed = await cli(['seed', '--seed', 'many'])
    expect(Exit.isFailure(seed.exit)).toBe(true)
  })

  it('reports a config that is not there, without starting anything', async () => {
    const dir = tmp()
    process.chdir(dir)
    const { exit, printed } = await cli(['seed', '--config', 'missing.ts'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('Config not found: missing.ts')
  })
})

describe('resolveSchemaPath', () => {
  // Both failures carry the same sentence; only one of them also asks for the usage block.
  const resolve = (explicit: string | null) =>
    Effect.runPromise(
      Effect.provide(
        Effect.match(resolveSchemaPath(explicit, ['hekireki', 'studio']), {
          onSuccess: (value) => ({ ok: true, value }) as const,
          onFailure: (error) =>
            ({
              ok: false,
              help: error instanceof CliError.ShowHelp,
              error: userMessageOf(error),
            }) as const,
        }),
        NodeFileSystem.layer,
      ),
    )

  it('exposes the default candidates in order', () => {
    expect(DEFAULT_SCHEMA_PATHS).toStrictEqual(['prisma/schema.prisma', 'schema.prisma'])
  })

  it('uses the explicit path when it exists', async () => {
    const dir = tmp()
    const file = path.join(dir, 'db.prisma')
    writeFileSync(file, '')
    expect(await resolve(file)).toStrictEqual({ ok: true, value: file })
  })

  it('falls back to schema.prisma when there is no prisma/ directory', async () => {
    const dir = tmp()
    process.chdir(dir)
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    expect(await resolve(null)).toStrictEqual({ ok: true, value: 'schema.prisma' })
  })

  it('takes a directory of .prisma files, not only a file', async () => {
    const dir = tmp()
    process.chdir(dir)
    mkdirSync(path.join(dir, 'prisma'))
    writeFileSync(path.join(dir, 'prisma', 'base.prisma'), '')
    expect(await resolve('prisma')).toStrictEqual({ ok: true, value: 'prisma' })
  })

  it('names the path that is not there, without the usage block', async () => {
    expect(await resolve('/nowhere/schema.prisma')).toStrictEqual({
      ok: false,
      help: false,
      error: 'Schema not found: /nowhere/schema.prisma\n   Check the path passed to --schema.',
    })
  })

  it('asks for the usage block when nothing was typed and nothing was found', async () => {
    process.chdir(tmp())
    const result = await resolve(null)
    expect(result.ok).toBe(false)
    expect(result).toMatchObject({ help: true })
  })

  it('prefers prisma/schema.prisma when both exist', async () => {
    const dir = tmp()
    process.chdir(dir)
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    mkdirSync(path.join(dir, 'prisma'))
    writeFileSync(path.join(dir, 'prisma', 'schema.prisma'), '')
    expect(await resolve(null)).toStrictEqual({ ok: true, value: 'prisma/schema.prisma' })
  })
})

describe('studioBanner', () => {
  it('describes a connected database', () => {
    expect(
      studioBanner({
        port: 5555,
        schemaPath: 'prisma/schema.prisma',
        error: null,
        database: { connected: true, dialect: 'sqlite', url: 'file:./dev.db', error: null },
      }),
    ).toBe(
      `⚡️ Hekireki Studio started at http://localhost:5555\n   Schema: ${path.resolve('prisma/schema.prisma')} (watching for changes)\n   Database: sqlite file:./dev.db`,
    )
  })

  it('explains a missing database and a broken schema', () => {
    expect(
      studioBanner({
        port: 3000,
        schemaPath: '/tmp/schema.prisma',
        error: 'error: boom',
        database: { connected: false, dialect: null, url: null, error: 'No database URL found.' },
      }),
    ).toBe(
      '⚡️ Hekireki Studio started at http://localhost:3000\n   Schema: /tmp/schema.prisma (watching for changes)\n   Database: not connected (schema only)\n   No database URL found.\n   Schema has errors, fix them and Studio will reload:\nerror: boom',
    )
  })
})

describe('hekireki seed, the command line itself', () => {
  it.each([
    [['seed', '--count', 'abc'], 'count'],
    [['seed', '--count', '1.5'], 'count'],
    [['seed', '--seed', '1.5'], 'seed'],
    [['seed', '--nope'], 'nope'],
    [['seed', 'extra'], 'extra'],
    [['seed', '--sql'], 'sql'],
    [['seed', '--locale'], 'locale'],
  ])('rejects %j while reading the command line, naming %s', async (args, word) => {
    const { exit, printed } = await cli(args)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed.toLowerCase()).toContain(word)
  })

  it('refuses a negative count before anything is generated', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'schema.prisma'),
      'datasource db {\n  provider = "sqlite"\n}\n\nmodel User {\n  id Int @id @default(autoincrement())\n}\n',
    )
    process.chdir(dir)
    const { exit, printed } = await cli(['seed', '--count', '-1', '--sql', 'out.sql'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('count')
    expect(existsSync(path.join(dir, 'out.sql'))).toBe(false)
  })

  it('describes where the database and the config come from', async () => {
    const { out } = await cli(['seed', '--help'])
    expect(out).toContain(
      'Path to the config, a TypeScript file (default: hekireki.config.ts in the working directory)',
    )
    expect(out).toContain(
      'default: `url` in hekireki.config.ts, then the variable datasource.url names in prisma.config.ts or the schema, read from the environment or .env; DATABASE_URL when it names none',
    )
    const studio = await cli(['studio', '--help'])
    expect(studio.out).toContain(
      'default: `url` in hekireki.config.ts, then the variable datasource.url names in prisma.config.ts or the schema, read from the environment or .env; DATABASE_URL when it names none',
    )
  })

  it('renders the same document for `seed help` and `seed --help`', async () => {
    const direct = await cli(['seed', '--help'])
    const viaHelp = await cli(['seed', 'help'])
    expect(viaHelp.out).toBe(direct.out)
  })

  it('writes the SQL script through the command line with the short flags, no database needed', async () => {
    const dir = tmp()
    writeFileSync(
      path.join(dir, 'schema.prisma'),
      'datasource db {\n  provider = "postgresql"\n}\n\nmodel User {\n  id    Int    @id @default(autoincrement())\n  email String @unique\n}\n',
    )
    writeFileSync(path.join(dir, 'hekireki.config.ts'), 'export default { seed: 3, count: 4 }\n')
    process.chdir(dir)
    const { exit, out } = await cli([
      'seed',
      '-s',
      'schema.prisma',
      '-n',
      '2',
      '-l',
      'ja',
      '--sql',
      'out/seed.sql',
    ])
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(out).toContain('Seeded 2 rows (seed 3, locale ja)')
    expect(out).toContain(`SQL: ${path.join(dir, 'out', 'seed.sql')}`)
    const script = readFileSync(path.join(dir, 'out', 'seed.sql'), 'utf8')
    expect(
      script.startsWith('-- Generated by hekireki seed (seed 3, locale ja)\n-- User: 2\nBEGIN;\n'),
    ).toBe(true)
    expect(script.endsWith('COMMIT;\n')).toBe(true)
    // The same command line writes the same script.
    await cli(['seed', '-s', 'schema.prisma', '-n', '2', '-l', 'ja', '--sql', 'out/again.sql'])
    expect(readFileSync(path.join(dir, 'out', 'again.sql'), 'utf8')).toBe(script)
  })
})

describe('hekireki migrate check', () => {
  const SCHEMA = `datasource db {
  provider = "sqlite"
}

model User {
  id    Int    @id
  email String @unique
  name  String
}
`

  function project(rows: string) {
    const dir = tmp()
    writeFileSync(path.join(dir, 'schema.prisma'), SCHEMA)
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    db.exec(
      `CREATE TABLE "User" ("id" INTEGER NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT); ${rows}`,
    )
    db.close()
    process.chdir(dir)
    return dir
  }

  it('documents its flags, and `migrate` lists it', async () => {
    const { exit, out } = await cli(['migrate', 'check', '--help'])
    expect(Exit.isSuccess(exit)).toBe(true)
    for (const flag of ['--schema', '--url', '--json']) {
      expect(out).toContain(flag)
    }
    expect(out).toContain('hekireki migrate check --json')
    const migrate = await cli(['migrate', '--help'])
    expect(migrate.out).toContain('check')
    const viaHelp = await cli(['migrate', 'check', 'help'])
    expect(viaHelp.out).toBe(out)
  })

  it('rejects a database URL it has no driver for', async () => {
    const { exit, printed } = await cli(['migrate', 'check', '--url', 'mongodb://localhost/app'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain('a postgres://, postgresql://, mysql:// or file: connection string')
  })

  it('prints the report and fails when rows block the migration', async () => {
    project(`INSERT INTO "User" VALUES (1, 'a@example.com', NULL), (2, 'a@example.com', 'Bo');`)
    const { exit, out, printed } = await cli(['migrate', 'check', '-u', 'file:./dev.db'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(out).toContain('⚡️ Migration check: 2 blocking problems')
    expect(out).toContain('User.name   column becomes NOT NULL  1 NULL row')
    expect(out).toContain('User.email  unique                   1 duplicate group')
    expect(printed).toContain(
      '2 blocking problems in the data: fix the rows, or decide what becomes of them on the Migrate page of hekireki studio, before migrating.',
    )
  })

  it('takes the decisions Studio kept beside the schema, and plan writes them as SQL', async () => {
    const dir = project(
      `INSERT INTO "User" VALUES (1, 'a@example.com', NULL), (2, 'a@example.com', 'Bo');`,
    )
    mkdirSync(path.join(dir, '.hekireki'))
    writeFileSync(
      path.join(dir, '.hekireki', 'migrate.json'),
      JSON.stringify({
        decisions: [
          { kind: 'not-null', modelName: 'User', field: 'name', choice: 'value', value: 'unknown' },
          {
            kind: 'unique',
            modelName: 'User',
            field: 'email',
            choice: 'keep-last-delete',
            value: null,
          },
        ],
      }),
    )
    const checked = await cli(['migrate', 'check', '-u', 'file:./dev.db'])
    expect(Exit.isSuccess(checked.exit)).toBe(true)
    expect(checked.out).toContain('⚡️ Migration check: the data is ready for this schema')
    expect(checked.out).toContain('User.name   NULLs set to "unknown"')
    const planned = await cli(['migrate', 'plan', '-u', 'file:./dev.db'])
    expect(Exit.isSuccess(planned.exit)).toBe(true)
    // stdout is the SQL alone, to redirect into a file; what to know about it goes to stderr.
    expect(planned.out).toBe(`-- hekireki migrate plan

UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL;

DELETE FROM "User" WHERE "id" IN (SELECT "id" FROM (SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" DESC) AS "hk_rank" FROM "User") AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL);`)
    expect(planned.err).toBe(
      [
        '   Put it at the top of the migration Prisma writes for the schema (`prisma migrate dev --create-only` writes one to edit), or pass that migration with --migration.',
        '   Prisma runs a migration a statement at a time, with no transaction around it: if a statement fails, the ones before it, the fixes included, stay done.',
        '   The check counted the rows as they were when it ran. Rows written since are not in it: stop what writes to these tables while the plan runs, or run `hekireki migrate check` again right before it.',
        '   It deletes rows, drops what holds them or writes over values, and nothing here undoes a statement that has run: take a backup before it.',
      ].join('\n'),
    )
    const written = await cli(['migrate', 'plan', '-u', 'file:./dev.db', '-o', 'out/fixes.sql'])
    expect(Exit.isSuccess(written.exit)).toBe(true)
    expect(written.out).toContain(
      `Plan: ${path.join(dir, 'out', 'fixes.sql')}\n   Put it at the top of the migration Prisma writes`,
    )
    expect(readFileSync(path.join(dir, 'out', 'fixes.sql'), 'utf8')).toBe(`${planned.out}\n`)
    // Nothing reached the database: the plan is for the migration to run.
    const db = new DatabaseSync(path.join(dir, 'dev.db'))
    expect({
      ...db.prepare('SELECT COUNT(*) AS n FROM "User" WHERE "name" IS NULL').get(),
    }).toStrictEqual({ n: 1 })
    db.close()
  })

  it('reads the decisions named by --decisions, and says what in them does not fit', async () => {
    const dir = project(`INSERT INTO "User" VALUES (1, 'a@example.com', 'Al');`)
    writeFileSync(
      path.join(dir, 'decisions.json'),
      JSON.stringify({
        decisions: [
          { kind: 'not-null', modelName: 'User', field: 'nmae', choice: 'value', value: 'x' },
        ],
      }),
    )
    const { exit, printed } = await cli([
      'migrate',
      'check',
      '-u',
      'file:./dev.db',
      '-d',
      'decisions.json',
    ])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(printed).toContain(
      `The decisions in ${path.join(dir, 'decisions.json')} do not fit the schema and the database:`,
    )
    expect(printed).toContain('User.nmae: User has no field nmae.')
    const typo = await cli(['migrate', 'check', '-u', 'file:./dev.db', '--timeout', 'soon'])
    expect(Exit.isFailure(typo.exit)).toBe(true)
  })

  it('documents plan, and migrate lists both', async () => {
    const { exit, out } = await cli(['migrate', 'plan', '--help'])
    expect(Exit.isSuccess(exit)).toBe(true)
    for (const flag of ['--schema', '--url', '--decisions', '--timeout', '--output']) {
      expect(out).toContain(flag)
    }
    const migrate = await cli(['migrate', '--help'])
    expect(migrate.out).toContain('plan')
    expect(migrate.out).toContain('check')
  })

  it('passes, with JSON on stdout, when the rows fit the schema', async () => {
    project(`INSERT INTO "User" VALUES (1, 'a@example.com', 'Al'), (2, 'b@example.com', 'Bo');`)
    const { exit, out } = await cli(['migrate', 'check', '--url', 'file:./dev.db', '--json'])
    expect(Exit.isSuccess(exit)).toBe(true)
    const report: unknown = JSON.parse(out)
    expect(report).toMatchObject({
      ok: true,
      summary: { blocking: 0, warning: 0, failed: 0, passed: 2, guaranteed: 3 },
      database: { dialect: 'sqlite', url: 'file:./dev.db' },
    })
  })
})
