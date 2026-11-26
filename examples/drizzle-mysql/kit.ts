// drizzle-kit push against the tables `prisma db push` made: the generated schema has to describe
// the BIT columns as they are, so drizzle-kit writes nothing for them, defaults included. (It still
// rewrites a String @unique column, varchar(191), which is not what this example checks.)
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const url = process.env.DRIZZLE_DATABASE ?? 'mysql://root:root@localhost:3306/drizzle_dates'
const kit = fileURLToPath(
  new URL('../../packages/hekireki/node_modules/.bin/drizzle-kit', import.meta.url),
)
const result = spawnSync(
  kit,
  ['push', '--dialect=mysql', '--schema=src/db/schema.ts', `--url=${url}`, '--force', '--verbose'],
  { encoding: 'utf8' },
)
const output = `${result.stdout}${result.stderr}`
const bitStatements = output.split('\n').filter((line) => /`(on|off|maybe|mask)`|bit\(/u.test(line))
if (result.status !== 0 || bitStatements.length > 0) {
  throw new Error(`drizzle-kit push would change the BIT columns:\n${output}`)
}
console.log('ok: drizzle-kit push leaves the BIT columns as Prisma made them')
