// A check in each time zone a process may be in: `node zones.ts check.ts`. UTC, JST, one with
// daylight saving and one half an hour off are what it runs without being told; DRIZZLE_ZONES
// names others, `DRIZZLE_ZONES=Europe/Paris,Pacific/Auckland`. The check throws on the first
// thing that differs, and so does this.
import { execFileSync } from 'node:child_process'

const zones = (process.env.DRIZZLE_ZONES ?? 'UTC,Asia/Tokyo,America/New_York,Asia/Kolkata').split(
  ',',
)
for (const zone of zones) {
  // Node takes a TZ it does not know for UTC and says nothing: Intl throws on one.
  const offset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(new Date())
    .find((part) => part.type === 'timeZoneName')?.value
  console.log(`\n# TZ=${zone} (${offset})`)
  execFileSync('node', process.argv.slice(2), {
    stdio: 'inherit',
    env: { ...process.env, TZ: zone },
  })
}
