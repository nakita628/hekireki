import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { NodeFileSystem } from '@effect/platform-node'
import type { GeneratorOptions } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { ecto } from './ecto.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

const SCHEMA = `datasource db {
  provider = "mysql"
}

model Doc {
  id   Int  @id @default(autoincrement())
  body Json
}
`

/** The slice of `GeneratorOptions` this generator reads, for a MySQL schema with a Json field. */
function run(config: Record<string, string | string[]>) {
  const output = mkdtempSync(path.join(tmpdir(), 'hekireki-ecto-'))
  dirs.push(output)
  const result = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  const options = {
    generator: {
      isCustomOutput: true,
      output: { fromEnvVar: null, value: output },
      config,
      sourceFilePath: path.join(output, 'schema.prisma'),
    },
    datamodel: SCHEMA,
    datasources: [{ activeProvider: 'mysql' }],
    dmmf: result,
  } as unknown as GeneratorOptions
  return Effect.runPromiseExit(Effect.provide(ecto(options), NodeFileSystem.layer)).then(
    (exit) => ({ exit, output }),
  )
}

/** The message of a failure, whichever way it failed. */
function failure(exit: Exit.Exit<unknown, { readonly message: string }>) {
  return Exit.isFailure(exit) ? String(exit.cause) : ''
}

describe('ecto', () => {
  it('writes the PrismaJson mysqlFlavor names', async () => {
    const { exit, output } = await run({ mysqlFlavor: 'mariadb' })
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(readFileSync(path.join(output, 'prisma_json.ex'), 'utf8')).toContain(
      '      {:ok, json} -> {:ok, json}\n      _ -> :error\n',
    )
  })

  it('refuses a mysqlFlavor that is neither mysql nor mariadb', async () => {
    const { exit } = await run({ mysqlFlavor: 'percona' })
    expect(failure(exit)).toContain(
      'mysqlFlavor of Hekireki-Ecto is "mysql" or "mariadb", not "percona".',
    )
  })
})
