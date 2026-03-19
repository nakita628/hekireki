import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = resolve(fileURLToPath(import.meta.url), '..', 'packages', 'hekireki')
process.chdir(pkgDir)
