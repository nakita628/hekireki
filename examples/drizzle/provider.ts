// The example on PostgreSQL or MySQL: `node provider.ts postgresql` (or `mysql`), against the
// databases of examples/compose.yaml, or the one DRIZZLE_DATABASE names. schema.prisma is written
// again under .provider/<provider>/ with that provider and a model of what SQLite has not: the
// native date and time types, and the scalars whose column a provider decides (`Bytes`, `BigInt`,
// `Decimal`). What it generates there is type-checked with check.<provider>.ts, pushed to the
// database and run in each time zone of zones.ts, as the check on SQLite is.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const URLS: Readonly<Record<string, string>> = {
  postgresql: 'postgresql://postgres:postgres@localhost:5432/drizzle',
  mysql: 'mysql://root:root@localhost:3306/drizzle',
}

const provider = process.argv[2] ?? ''
const url = process.env.DRIZZLE_DATABASE ?? URLS[provider]
if (url === undefined) {
  console.error('usage: node provider.ts postgresql|mysql')
  process.exit(1)
}

const SLOT = `
model Slot {
  id        Int        @id @default(autoincrement())
  name      String     @unique
  day       DateTime   @db.Date
  opensAt   DateTime   @db.Time(3) @map("opens_at")
${
  provider === 'mysql'
    ? `  precise   DateTime   @db.DateTime(6)
  stamped   DateTime   @db.Timestamp(3)
  payload   Bytes
  digest    Bytes?     @db.VarBinary(16)`
    : `  precise   DateTime   @db.Timestamp(6)
  zoned     DateTime   @db.Timestamptz(3)
  zonedTime DateTime   @db.Timetz(3) @map("zoned_time")
  moments   DateTime[]
  payload   Bytes
  digest    Bytes      @default("AAH/")`
}
  count     BigInt
  price     Decimal    @db.Decimal(10, 2)

  @@map("slots")
}
`

const dir = path.resolve('.provider', provider)
mkdirSync(dir, { recursive: true })
writeFileSync(
  path.join(dir, 'schema.prisma'),
  readFileSync('schema.prisma', 'utf8').replace('provider = "sqlite"', `provider = "${provider}"`) +
    SLOT,
)
writeFileSync(
  path.join(dir, 'tsconfig.json'),
  `${JSON.stringify(
    {
      extends: '../../tsconfig.json',
      compilerOptions: { types: ['node'] },
      include: [`../../check.${provider}.ts`, 'src/db/schema.ts'],
    },
    null,
    2,
  )}\n`,
)

const run = (command: string, args: readonly string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

const schemaPath = path.join(dir, 'schema.prisma')
run('pnpm', ['exec', 'prisma', 'generate', '--schema', schemaPath])
// The database is made when it is not there; the check empties the tables it uses.
run('pnpm', ['exec', 'prisma', 'db', 'push', '--schema', schemaPath, '--url', url])
run('pnpm', ['exec', 'tsc', '-p', path.join(dir, 'tsconfig.json')])
run('node', ['zones.ts', `check.${provider}.ts`], { DRIZZLE_DATABASE: url })
