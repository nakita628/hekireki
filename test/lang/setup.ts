import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { getDMMF } from '@prisma/get-dmmf'

// Regenerates test/harness/* from test/prisma/schema.prisma with the built generators
// before the language checks run. One prisma run emits every target, so
// running a single language's file still starts from fresh output. Further runs
// cover test/prisma/efcore.prisma and test/prisma/exposed.prisma, the hazards
// particular to C# and EF Core and to Kotlin and Exposed.
//
// The generators whose output turns most on the database — column types, keys, defaults — are
// run again on SQLite and on MySQL: the same schema with the provider changed and the lines Prisma
// refuses for it left out (a scalar list, a native type of PostgreSQL), so the variants follow
// schema.prisma with no copy to keep in step. Each writes under harness/<lang>/variants/<provider>/,
// where the language's check compiles and type-checks the output alone, without the smoke code
// that names fields only the PostgreSQL schema has.
//
// The generated files are gitignored: the byte-for-byte golden masters live in
// packages/hekireki/src/**/*.test.ts, and these harnesses only answer the
// question a string comparison cannot — does the output compile and load
// against the real GORM / sea-orm / SQLAlchemy / Pydantic / Ecto / Drizzle /
// Kysely / Active Record / Eloquent / EF Core / Exposed API.

const LANGS = [
  'gorm',
  'sea-orm',
  'sqlalchemy',
  'pydantic',
  'django',
  'ecto',
  'drizzle',
  'kysely',
  'activerecord',
  'eloquent',
  'atlas',
  'efcore',
  'exposed',
] as const

const STALE_OUTPUT = [
  'gorm/model/models.go',
  'sea-orm/src/entities',
  'sqlalchemy/models.py',
  'pydantic/models.py',
  'django/app/models.py',
  'ecto/lib',
  'drizzle/schema.ts',
  'kysely/types.ts',
  'activerecord/models',
  'eloquent/models',
  'atlas/schema.hcl',
  'efcore/Models',
  'efcore/Edge',
  'exposed/src/main/kotlin/models',
  'exposed/src/main/kotlin/hekireki',
]

const VARIANT_PROVIDERS = ['sqlite', 'mysql'] as const

/** The generator blocks of the variants: each target's name and where it writes, under harness/. */
const VARIANT_TARGETS = [
  ['gorm', (provider: string) => `gorm/variants/${provider}`],
  ['sea-orm', (provider: string) => `sea-orm/src/variants/${provider}`],
  ['sqlalchemy', (provider: string) => `sqlalchemy/variants/${provider}`],
  ['drizzle', (provider: string) => `drizzle/variants/${provider}/schema.ts`],
  ['kysely', (provider: string) => `kysely/variants/${provider}/types.ts`],
] as const

const VARIANT_OUTPUT = [
  'gorm/variants',
  'sea-orm/src/variants/sqlite',
  'sea-orm/src/variants/mysql',
  'sqlalchemy/variants',
  'drizzle/variants',
  'kysely/variants',
]

/**
 * schema.prisma on another provider: its own generator blocks for the variant targets, and every
 * line Prisma refuses there commented out, asked again until Prisma takes the schema.
 */
function variantSchema(root: string, provider: string) {
  const generators = VARIANT_TARGETS.map(
    ([lang, output]) =>
      `generator ${lang} {\n  provider = "hekireki-${lang}"\n  output   = "${join(root, 'test/harness', output(provider))}"\n}\n`,
  ).join('\n')
  const models = readFileSync(join(root, 'test/prisma/schema.prisma'), 'utf8')
    .replaceAll(/generator [\w-]+ \{[\s\S]*?\n\}\n/gu, '')
    .replace(/datasource db \{[\s\S]*?\n\}\n/u, '')
  const lines = `datasource db {\n  provider = "${provider}"\n}\n\n${generators}\n${models}`.split(
    '\n',
  )
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = getDMMF({ datamodel: [['schema.prisma', lines.join('\n')]] })
    if (!('type' in result)) return lines.join('\n')
    const refused = [
      ...new Set(
        [...stripVTControlCharacters(result.error.message).matchAll(/schema\.prisma:(\d+)/gu)].map(
          (match) => Number(match[1]),
        ),
      ),
    ]
    if (refused.length === 0)
      throw new Error(
        `The ${provider} variant of schema.prisma does not parse: ${result.error.message}`,
      )
    for (const line of refused) lines[line - 1] = `// ${lines[line - 1]}`
  }
  throw new Error(`The ${provider} variant of schema.prisma still does not parse`)
}

export default function setup() {
  const root = resolve(import.meta.dirname, '../..')
  const dist = join(root, 'packages/hekireki/dist/bin')

  if (!existsSync(join(dist, 'gorm.js'))) {
    throw new Error(
      `${dist} not found. Build the generators first: pnpm -F hekireki build (or vp run hekireki#build)`,
    )
  }

  // prisma resolves `provider = "hekireki-gorm"` by name on PATH, so the built
  // bins are linked into a throwaway directory that is prepended to it.
  const bin = mkdtempSync(join(tmpdir(), 'hekireki-lang-bin-'))
  for (const lang of LANGS) {
    symlinkSync(join(dist, `${lang}.js`), join(bin, `hekireki-${lang}`))
  }

  for (const output of [...STALE_OUTPUT, ...VARIANT_OUTPUT]) {
    rmSync(join(root, 'test/harness', output), { recursive: true, force: true })
  }

  // The drizzle and kysely harnesses import drizzle-orm / kysely and the
  // id-generator packages, all devDependencies of packages/hekireki. They sit
  // outside that package, so upward node_modules resolution never reaches
  // them — link the real tree in rather than remapping every specifier in
  // their tsconfigs.
  for (const tsHarness of ['drizzle', 'kysely']) {
    const harnessModules = join(root, `test/harness/${tsHarness}/node_modules`)
    if (!existsSync(harnessModules)) {
      symlinkSync(join(root, 'packages/hekireki/node_modules'), harnessModules)
    }
  }

  for (const schema of ['schema.prisma', 'efcore.prisma', 'exposed.prisma']) {
    execFileSync(
      join(root, 'packages/hekireki/node_modules/.bin/prisma'),
      ['generate', '--schema', join(root, 'test/prisma', schema)],
      {
        cwd: root,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          DATABASE_URL: 'postgresql://localhost/hekireki_lang',
        },
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    )
  }

  const variants = mkdtempSync(join(tmpdir(), 'hekireki-lang-variants-'))
  for (const provider of VARIANT_PROVIDERS) {
    const schema = join(variants, `${provider}.prisma`)
    writeFileSync(schema, variantSchema(root, provider))
    execFileSync(
      join(root, 'packages/hekireki/node_modules/.bin/prisma'),
      ['generate', '--schema', schema],
      {
        cwd: root,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    )
  }

  return () => {
    rmSync(bin, { recursive: true, force: true })
    rmSync(variants, { recursive: true, force: true })
  }
}
