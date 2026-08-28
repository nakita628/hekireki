import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Regenerates test/harness/* from test/schema.prisma with the built generators
// before the language checks run. One prisma run emits every target, so
// running a single language's file still starts from fresh output.
//
// The generated files are gitignored: the byte-for-byte golden masters live in
// packages/hekireki/src/**/*.test.ts, and these harnesses only answer the
// question a string comparison cannot — does the output compile and load
// against the real GORM / sea-orm / SQLAlchemy / Pydantic / Ecto / Drizzle /
// Kysely / Active Record / Eloquent API.

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
]

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

  for (const output of STALE_OUTPUT) {
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

  execFileSync(
    join(root, 'packages/hekireki/node_modules/.bin/prisma'),
    ['generate', '--schema', join(root, 'test/schema.prisma')],
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

  return () => {
    rmSync(bin, { recursive: true, force: true })
  }
}
