// Runs Gradle without installing it: the distribution named below is fetched once into
// .gradle-dist/, checked against the SHA-256 services.gradle.org publishes for it, and unpacked
// with the JDK's own `jar`. A wrapper would do the same from a binary gradle-wrapper.jar committed
// here; this keeps the example to text. The arguments are Gradle's: `node gradle.ts installDist`.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const VERSION = '9.8.0'
const SHA256 = 'bafd5ce9cfaea0fbccfdc8439a1ac42fbd4cd9c89dc9a988228d8a2639a58e6c'

const home = path.resolve(import.meta.dirname, '.gradle-dist')
const launcher = path.join(home, `gradle-${VERSION}`, 'bin', 'gradle')

if (!existsSync(launcher)) {
  const response = await fetch(
    `https://services.gradle.org/distributions/gradle-${VERSION}-bin.zip`,
  )
  if (!response.ok) throw new Error(`Gradle ${VERSION}: HTTP ${response.status}`)
  const zip = Buffer.from(await response.arrayBuffer())
  const digest = createHash('sha256').update(zip).digest('hex')
  if (digest !== SHA256) throw new Error(`Gradle ${VERSION}: SHA-256 ${digest}, not ${SHA256}`)
  mkdirSync(home, { recursive: true })
  const archive = path.join(home, `gradle-${VERSION}-bin.zip`)
  writeFileSync(archive, zip)
  execFileSync('jar', ['xf', archive], { cwd: home, stdio: 'inherit' })
  rmSync(archive)
}

// `jar` does not keep the launcher's execute bit, so the shell runs it. The dependencies are
// cached beside the distribution unless GRADLE_USER_HOME names a cache of your own.
execFileSync('sh', [launcher, '--console=plain', '--quiet', ...process.argv.slice(2)], {
  cwd: import.meta.dirname,
  stdio: 'inherit',
  env: { GRADLE_USER_HOME: path.join(home, 'home'), ...process.env },
})
