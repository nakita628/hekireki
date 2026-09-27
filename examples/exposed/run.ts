// Pushes schema.prisma to the database EXPOSED_DATABASE names (the PostgreSQL of
// examples/compose.yaml by default), builds Check.kt with the tables and entities `prisma generate`
// wrote, and runs it with the JVM and Node in Asia/Tokyo and then in UTC: Check.kt's own checks,
// then Exposed's rows for interop.ts, which reads them through Prisma Client and writes its own,
// which Check.kt reads. An instant that holds only in UTC fails the first round.
import { execFileSync } from 'node:child_process'

const url = process.env.EXPOSED_DATABASE ?? 'postgresql://postgres:postgres@localhost:5432/exposed'

const run = (command: string, args: readonly string[], env: Record<string, string> = {}) =>
  execFileSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } })

// The database is made when it is not there; Check.kt empties the tables it uses.
run('pnpm', ['exec', 'prisma', 'db', 'push', '--url', url])
run('node', ['gradle.ts', 'installDist'])

// pgjdbc takes the user and password as parameters of the URL.
const { host, pathname, username, password } = new URL(url)
const jdbc = `jdbc:postgresql://${host}${pathname}?user=${username}&password=${password}`
const check = 'build/install/exposed-example/bin/exposed-example'

for (const zone of ['Asia/Tokyo', 'UTC']) {
  console.log(`# TZ=${zone}, -Duser.timezone=${zone}`)
  const env = { TZ: zone, JAVA_OPTS: `-Duser.timezone=${zone}`, EXPOSED_DATABASE: url }
  run(check, ['check', jdbc], env)
  run(check, ['seed', jdbc], env)
  run('node', ['interop.ts'], env)
  run(check, ['read', jdbc], env)
}
