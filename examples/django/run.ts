// check.py, then interop.ts and interop.py on the rows it leaves, once with the process and Django
// in Asia/Tokyo and once in UTC: an instant that holds only in UTC fails the first. The database,
// models and client are dev.db, app/ and generated/client, or the ones provider.ts passes on in
// DJANGO_DATABASE, DJANGO_APP_DIR and DJANGO_CLIENT.
import { execFileSync } from 'node:child_process'

for (const zone of ['Asia/Tokyo', 'UTC']) {
  console.log(`# TZ=${zone}, TIME_ZONE = "${zone}"`)
  const env = { ...process.env, TZ: zone, DJANGO_TIME_ZONE: zone }
  for (const [command, args] of [
    ['.venv/bin/python', ['check.py']],
    ['node', ['interop.ts']],
    ['.venv/bin/python', ['interop.py']],
  ] as const) {
    execFileSync(command, args, { stdio: 'inherit', env })
  }
}
