import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeServices } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import { CliError } from 'effect/unstable/cli'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { DEFAULT_SCHEMA_PATHS } from './constants.js'
import { hekirekiCli, helpAsFlag, resolveSchemaPath, studioBanner } from './index.js'

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
  return (error instanceof CliError.UserError ? error.userMessage : undefined) ?? String(error)
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
  it('prints what --help prints', async () => {
    const help = await cli(['help'])
    const flag = await cli(['--help'])
    expect(Exit.isSuccess(help.exit)).toBe(true)
    expect(help.out).toBe(flag.out)
  })

  it('takes the command to explain, before or after it', async () => {
    const studio = await cli(['studio', '--help'])
    const before = await cli(['help', 'studio'])
    const after = await cli(['studio', 'help'])
    expect(before.out).toBe(studio.out)
    expect(after.out).toBe(studio.out)
  })

  it('leaves a flag value that reads `help` alone', () => {
    expect(helpAsFlag(['studio', '--schema', 'help'])).toStrictEqual(['studio', '--schema', 'help'])
    expect(helpAsFlag(['studio', '-p', '3000'])).toStrictEqual(['studio', '-p', '3000'])
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
        fileSystemLayer,
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

  it('renders the same document for `help seed` and `seed --help`', async () => {
    const direct = await cli(['seed', '--help'])
    const viaHelp = await cli(['help', 'seed'])
    expect(Exit.isSuccess(viaHelp.exit)).toBe(true)
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
