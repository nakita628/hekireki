// <provider>/schema.prisma from auth.ts, and from it the ER diagram, er.png, and the drizzle
// schema, schema.ts: `node generate.ts` for the three providers, `node generate.ts mysql` for one.
// Better Auth's own CLI writes the models, under the datasource and the generators written here,
// and the drizzle schema it would write itself, better-auth.schema.ts, to read beside ours.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const providers =
  process.argv.length > 2 ? process.argv.slice(2) : ['sqlite', 'postgresql', 'mysql']

for (const provider of providers) {
  const schemaPath = path.join(provider, 'schema.prisma')
  const env = {
    ...process.env,
    BETTER_AUTH_PROVIDER: provider,
    BETTER_AUTH_SECRET: 'f3a9c1d27b8e4f60a5d3c9e1b7f2a8d4c6e0b9a3',
  }
  mkdirSync(provider, { recursive: true })
  writeFileSync(
    schemaPath,
    `datasource db {
  provider = "${provider}"
}

generator client {
  provider            = "prisma-client"
  output              = "generated/client"
  importFileExtension = "ts"
}

generator Hekireki-ER {
  provider = "hekireki-er"
  outputs  = ["er.png"]
}

generator Hekireki-Drizzle {
  provider = "hekireki-drizzle"
  output   = "schema.ts"
}
`,
  )
  execFileSync(
    'pnpm',
    ['exec', 'auth', 'generate', '--config', 'auth.ts', '--output', schemaPath, '--yes'],
    { stdio: 'inherit', env },
  )
  // Where the database has no arrays a list is a String holding JSON, and the CLI leaves the
  // list's default on it, which Prisma refuses: `String? @default([])` is `@default("[]")`.
  writeFileSync(
    schemaPath,
    readFileSync(schemaPath, 'utf8').replaceAll(
      /^(\s+\w+\s+String\??\s+.*)@default\(\[\]\)/gmu,
      '$1@default("[]")',
    ),
  )
  execFileSync('pnpm', ['exec', 'prisma', 'validate', '--schema', schemaPath], { stdio: 'inherit' })
  execFileSync('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaPath], { stdio: 'inherit' })
  execFileSync(
    'pnpm',
    [
      'exec',
      'auth',
      'generate',
      '--config',
      'auth.ts',
      '--adapter',
      'drizzle',
      '--dialect',
      provider === 'postgresql' ? 'pg' : provider,
      '--output',
      path.join(provider, 'better-auth.schema.ts'),
      '--yes',
    ],
    { stdio: 'inherit', env },
  )
}
