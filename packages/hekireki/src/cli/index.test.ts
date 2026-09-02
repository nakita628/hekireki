import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeServices } from '@effect/platform-node'
import { Effect, Exit } from 'effect'
import { Command } from 'effect/unstable/cli'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import {
  DEFAULT_SCHEMA_PATHS,
  docsBanner,
  hekireki,
  resolveSchemaPath,
  studioBanner,
} from './index.js'

const dirs: string[] = []
const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-cli-'))
  dirs.push(dir)
  return dir
}

/** Runs the command tree the way the bin does and captures what it printed. */
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
    Command.runWith(hekireki, { version: '0.0.0-test' })(args).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )
  return { exit, out: out.join('\n'), err: err.join('\n') }
}

describe('hekireki --help', () => {
  it('lists the studio and docs subcommands', async () => {
    const { exit, out } = await cli(['--help'])
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(out).toContain('USAGE')
    expect(out).toContain('hekireki <subcommand>')
    expect(out).toContain('studio')
    expect(out).toContain('docs')
  })

  it('prints the version', async () => {
    const { out } = await cli(['--version'])
    expect(out).toContain('0.0.0-test')
  })

  it('rejects an unknown subcommand', async () => {
    const { exit, err } = await cli(['wat'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(err).toContain('Unknown subcommand "wat"')
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

  it('explains where it looked when no default schema exists', async () => {
    process.chdir(tmp())
    const { exit, err } = await cli(['studio'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(err).toContain('No Prisma schema found (looked for prisma/schema.prisma, schema.prisma)')
  })
})

describe('hekireki docs serve', () => {
  it('shows the docs help without a subcommand', async () => {
    const { out } = await cli(['docs'])
    expect(out).toContain('hekireki docs <subcommand>')
    expect(out).toContain('serve')
  })

  it('documents the schema and port flags', async () => {
    const { out } = await cli(['docs', 'serve', '--help'])
    expect(out).toContain('--port, -p')
    expect(out).toContain('--schema, -s')
  })

  it('needs a schema, not generated HTML', async () => {
    process.chdir(tmp())
    const { exit, err } = await cli(['docs', 'serve'])
    expect(Exit.isFailure(exit)).toBe(true)
    expect(err).toContain('No Prisma schema found')
  })
})

describe('docsBanner', () => {
  it('points at the docs page and reports schema errors', () => {
    expect(docsBanner({ port: 5858, schemaPath: '/tmp/schema.prisma', error: null })).toBe(
      '⚡️ Hekireki Docs started at http://localhost:5858/docs\n📄 Schema: /tmp/schema.prisma (watching for changes)',
    )
    expect(docsBanner({ port: 5858, schemaPath: '/tmp/schema.prisma', error: 'boom' })).toBe(
      '⚡️ Hekireki Docs started at http://localhost:5858/docs\n📄 Schema: /tmp/schema.prisma (watching for changes)\n⚠️  Schema has errors, fix them and the docs will reload:\nboom',
    )
  })
})

describe('resolveSchemaPath', () => {
  const resolve = (explicit: string | null) =>
    Effect.runPromise(
      Effect.provide(
        Effect.match(resolveSchemaPath(explicit), {
          onSuccess: (value) => ({ ok: true, value }) as const,
          onFailure: (error) => ({ ok: false, error: error.message }) as const,
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

  it('falls back to prisma/schema.prisma, then schema.prisma', async () => {
    const dir = tmp()
    process.chdir(dir)
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    expect(await resolve(null)).toStrictEqual({ ok: true, value: 'schema.prisma' })
    writeFileSync(path.join(dir, 'prisma.prisma'), '')
    const nested = path.join(dir, 'prisma')
    rmSync(nested, { recursive: true, force: true })
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    expect(await resolve(null)).toStrictEqual({ ok: true, value: 'schema.prisma' })
  })

  it('prefers prisma/schema.prisma when both exist', async () => {
    const dir = tmp()
    process.chdir(dir)
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(path.join(dir, 'prisma'))
    writeFileSync(path.join(dir, 'prisma', 'schema.prisma'), '')
    expect(await resolve(null)).toStrictEqual({ ok: true, value: 'prisma/schema.prisma' })
  })
})

describe('studioBanner', () => {
  it('describes a connected database', () => {
    expect(
      studioBanner({
        port: 5858,
        schemaPath: 'prisma/schema.prisma',
        error: null,
        database: { connected: true, dialect: 'sqlite', url: 'file:./dev.db', error: null },
      }),
    ).toBe(
      `⚡️ Hekireki Studio started at http://localhost:5858\n📄 Schema: ${path.resolve('prisma/schema.prisma')} (watching for changes)\n🗄️  Database: sqlite file:./dev.db`,
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
      '⚡️ Hekireki Studio started at http://localhost:3000\n📄 Schema: /tmp/schema.prisma (watching for changes)\n🗄️  Database: not connected (schema only)\n   No database URL found.\n⚠️  Schema has errors, fix them and Studio will reload:\nerror: boom',
    )
  })
})
