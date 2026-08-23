import { resolve } from 'node:path'

const pkgDir = resolve(import.meta.filename, '..', 'packages', 'hekireki')
process.chdir(pkgDir)
