// The example on PostgreSQL or MySQL: `node provider.ts postgresql` (or `mysql`), against the
// databases of examples/compose.yaml, or the one ELOQUENT_DATABASE names. schema.prisma is written
// again under .provider/<provider>/ with that provider, and what it generates there (the models
// say different things per provider: the form a DateTime is written in) is pushed to the
// database and run through the same checks as on SQLite, as Capsule alone and as Laravel would.
//
// Two things are changed on the way, as `prisma db push` cannot make the tables with them:
// - Prisma writes an enum value into PostgreSQL's CREATE TYPE and MySQL's ENUM(...) without
//   escaping it, so `it's fine` ends the string. It is `it is fine` here. On MySQL the backslash
//   of `back\slash` is read as an escape too, and the column holds `backslash`, which the next
//   push takes for a change to make: it is `back/slash` there.
// - InnoDB refuses ON DELETE SET DEFAULT, and Prisma writes it all the same. It is left out on
//   MySQL, where the product's category is then Restrict.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const URLS: Readonly<Record<string, string>> = {
  postgresql: 'postgresql://postgres:postgres@localhost:5432/eloquent',
  // 127.0.0.1, not localhost: pdo_mysql reads localhost as its Unix socket.
  mysql: 'mysql://root:root@127.0.0.1:3306/eloquent',
}

const provider = process.argv[2] ?? ''
const url = process.env.ELOQUENT_DATABASE ?? URLS[provider]
if (url === undefined) {
  console.error('usage: node provider.ts postgresql|mysql')
  process.exit(1)
}

const dir = path.resolve('.provider', provider)
mkdirSync(dir, { recursive: true })
const schema = readFileSync('schema.prisma', 'utf8')
  .replace('provider = "sqlite"', `provider = "${provider}"`)
  .replace(`@map("it's fine")`, '@map("it is fine")')
  .replace(', onDelete: SetDefault', provider === 'mysql' ? '' : ', onDelete: SetDefault')
  .replace(
    '@map("back\\\\slash")',
    provider === 'mysql' ? '@map("back/slash")' : '@map("back\\\\slash")',
  )
writeFileSync(path.join(dir, 'schema.prisma'), schema)

const run = (command: string, args: readonly string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

const schemaPath = path.join(dir, 'schema.prisma')
run('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaPath])
// The database is made when it is not there; the checks empty the tables they use.
run('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', schemaPath, '--url', url])

const models = path.join(dir, 'app', 'Models')
for (const file of readdirSync(models)) {
  execFileSync('php', ['-l', path.join(models, file)], { stdio: 'ignore' })
}
const env = { ELOQUENT_DATABASE: url, ELOQUENT_MODELS: models }
run('php', ['check.php'], env)
run('php', ['check.php'], { ...env, ELOQUENT_LARAVEL: '1' })
run('node', ['interop.ts'], {
  ...env,
  ELOQUENT_CLIENT: path.join(dir, 'generated', 'client', 'client.ts'),
})
run('php', ['interop.php'], { ...env, ELOQUENT_LARAVEL: '1' })
