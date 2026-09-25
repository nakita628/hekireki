// The example on PostgreSQL or MySQL: `node provider.ts postgresql` (or `mysql`), against the
// databases of examples/compose.yaml, or the one DJANGO_DATABASE names. schema.prisma is written
// again under .provider/<provider>/ with that provider and the native type each `// postgresql:`
// or `// mysql:` comment names, and what it generates there is pushed to the database, read by
// mypy and run through the same checks as on SQLite.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const URLS: Readonly<Record<string, string>> = {
  postgresql: 'postgresql://postgres:postgres@localhost:5432/django',
  mysql: 'mysql://root:root@127.0.0.1:3306/django',
}

const provider = process.argv[2] ?? ''
const url = process.env.DJANGO_DATABASE ?? URLS[provider]
if (url === undefined) {
  console.error('usage: node provider.ts postgresql|mysql')
  process.exit(1)
}

// `at DateTime? // postgresql: @db.Timestamp(3)  mysql: @db.DateTime(3)` takes the attribute its
// provider names, and `//+postgresql: moments DateTime[]` is a field on that provider only.
const schema = readFileSync('schema.prisma', 'utf8')
  .replace('provider = "sqlite"', `provider = "${provider}"`)
  .replaceAll(new RegExp(`^(\\s*)//\\+${provider}: (.*)$`, 'gmu'), '$1$2')
  .replaceAll(/^(.*?)\s*\/\/ (?:postgresql|mysql): .*$/gmu, (line, field: string) => {
    const native = new RegExp(`${provider}: (@db\\.\\w+(?:\\([^)]*\\))?)`, 'u').exec(line)
    return native === null ? field : `${field} ${native[1]}`
  })

const dir = path.resolve('.provider', provider)
mkdirSync(path.join(dir, 'app'), { recursive: true })
writeFileSync(path.join(dir, 'app', '__init__.py'), '')
writeFileSync(path.join(dir, 'schema.prisma'), schema)

const run = (command: string, args: readonly string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

const schemaPath = path.join(dir, 'schema.prisma')
run('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaPath])
// The database is made when it is not there; check.py empties the tables it uses.
run('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', schemaPath, '--url', url])

const env = {
  DJANGO_DATABASE: url,
  DJANGO_APP_DIR: dir,
  DJANGO_CLIENT: path.join(dir, 'generated', 'client', 'client.ts'),
}
// cspell:ignore MYPYPATH
run('.venv/bin/python', ['-m', 'mypy', path.join(dir, 'app')], { ...env, MYPYPATH: dir })
run('node', ['run.ts'], env)
