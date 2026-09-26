// The check binary, then interop.ts and the binary's interop on the rows they leave, once with the
// process in Asia/Tokyo and once in UTC: an instant that holds only in UTC fails the first. The
// database, entities and client are dev.db, src/entities and generated/client, or the ones
// provider.ts passes on in SEA_ORM_DATABASE, SEA_ORM_PROVIDER and SEA_ORM_CLIENT.
import { execFileSync } from 'node:child_process'

const cargo = ['run', '--quiet', '--features', process.env.SEA_ORM_PROVIDER ?? 'sqlite', '--']
for (const zone of ['Asia/Tokyo', 'UTC']) {
  console.log(`# TZ=${zone}`)
  const env = { ...process.env, TZ: zone }
  for (const [command, args] of [
    ['cargo', [...cargo, 'check']],
    ['node', ['interop.ts']],
    ['cargo', [...cargo, 'interop']],
  ] as const) {
    execFileSync(command, args, { stdio: 'inherit', env })
  }
}
