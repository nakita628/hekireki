// The example on PostgreSQL or MySQL: `node provider.ts postgresql` (or `mysql`), against the
// databases of examples/compose.yaml, or the one SEA_ORM_DATABASE names. schema.prisma is written
// again under .provider/<provider>/ with that provider and the native type each `// postgresql:`
// or `// mysql:` comment names; the entities it generates there are what the check binary is
// built with (`--features <provider>`, see src/lib.rs), linted, and run as on SQLite.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const URLS: Readonly<Record<string, string>> = {
  postgresql: 'postgresql://postgres:postgres@localhost:5432/sea_orm',
  mysql: 'mysql://root:root@127.0.0.1:3306/sea_orm',
}

const provider = process.argv[2] ?? ''
const url = process.env.SEA_ORM_DATABASE ?? URLS[provider]
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
mkdirSync(dir, { recursive: true })
writeFileSync(path.join(dir, 'schema.prisma'), schema)

const run = (command: string, args: readonly string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

const schemaPath = path.join(dir, 'schema.prisma')
run('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaPath])
// The database is made when it is not there; the check empties the tables it uses.
run('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', schemaPath, '--url', url])
run('cargo', ['clippy', '--quiet', '--features', provider, '--', '-D', 'warnings'])
run('node', ['run.ts'], {
  SEA_ORM_PROVIDER: provider,
  SEA_ORM_DATABASE: url,
  SEA_ORM_CLIENT: path.join(dir, 'generated', 'client', 'client.ts'),
})
