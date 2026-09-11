#!/usr/bin/env node
// Checks that the TypeSpec packages hekireki builds the Studio API with resolve to one shared
// version in pnpm-lock.yaml. They are released in lockstep and each declares the others at its
// own version as peers (@typespec/openapi3 1.16.0 wants @typespec/compiler ^1.16.0), so a
// half-bumped set installs without error but mixes compilers or leaves a peer unsatisfied.
// Renovate groups these updates, but a security update bypasses the group and bumps only the
// advisory's package in the lockfile — this is the check that makes such a PR fail.
import { readFileSync } from 'node:fs'

const LOCKFILE = 'pnpm-lock.yaml'

// The 1.x packages of the TypeSpec release train that packages/hekireki depends on directly.
// The 0.x ones (@typespec/asset-emitter, @typespec/streams, ...) are versioned separately.
const PACKAGES = ['@typespec/compiler', '@typespec/http', '@typespec/openapi', '@typespec/openapi3']

const lockfile = readFileSync(LOCKFILE, 'utf8')

// The `packages:` section has one key per resolved version (`'@typespec/http@1.16.0':`); the
// `snapshots:` section after it repeats each version once per peer combination.
const start = lockfile.indexOf('\npackages:\n')
const end = lockfile.indexOf('\nsnapshots:\n', start)
if (start === -1 || end === -1) {
  console.error(`typespec: no packages section found in ${LOCKFILE}`)
  process.exit(1)
}
const section = lockfile.slice(start, end)

const resolved = new Map(
  PACKAGES.map((name) => {
    const key = new RegExp(`^  '${name.replace('/', '\\/')}@([^'(]+)':$`, 'gmu')
    return [name, [...section.matchAll(key)].map((match) => match[1]).toSorted()]
  }),
)

const versions = new Set([...resolved.values()].flat())

if (versions.size > 1 || [...resolved.values()].some((found) => found.length !== 1)) {
  for (const [name, found] of resolved) {
    console.error(`${name}: ${found.length > 0 ? found.join(', ') : 'not in the lockfile'}`)
  }
  const latest = [...versions]
    .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .at(-1)
  console.error(
    `\ntypespec: ${PACKAGES.join(', ')} must resolve to one shared version in ${LOCKFILE}.` +
      `\nAlign them with:\n  pnpm --filter hekireki up ${PACKAGES.map((name) => `${name}@^${latest}`).join(' ')}`,
  )
  process.exit(1)
}
