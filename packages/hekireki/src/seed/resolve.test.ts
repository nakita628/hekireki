import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { resolveTypeScript } from './resolve.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-seed-resolve-'))
  dirs.push(dir)
  return dir
}

/** A `next` that records what it was handed and answers with it, the way Node's default resolver would. */
function recorder() {
  const calls: string[] = []
  return {
    calls,
    next: (specifier: string) => {
      calls.push(specifier)
      return { url: specifier }
    },
  }
}

describe('resolveTypeScript', () => {
  it('passes bare specifiers through untouched, whatever the parent', () => {
    const dir = tmp()
    const spy = recorder()
    const parent = pathToFileURL(path.join(dir, 'config.ts')).href
    expect(resolveTypeScript('effect', { parentURL: parent }, spy.next)).toStrictEqual({
      url: 'effect',
    })
    expect(resolveTypeScript('node:fs', { parentURL: parent }, spy.next)).toStrictEqual({
      url: 'node:fs',
    })
    expect(resolveTypeScript('@prisma/client', { parentURL: undefined }, spy.next)).toStrictEqual({
      url: '@prisma/client',
    })
    expect(spy.calls).toStrictEqual(['effect', 'node:fs', '@prisma/client'])
  })

  it('passes a relative specifier through when the file exists exactly as written', () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'users.ts'), 'export const users = []\n')
    const spy = recorder()
    const parent = pathToFileURL(path.join(dir, 'config.ts')).href
    expect(resolveTypeScript('./users.ts', { parentURL: parent }, spy.next)).toStrictEqual({
      url: './users.ts',
    })
    expect(spy.calls).toStrictEqual(['./users.ts'])
  })

  it.each([
    ['./users', 'users.ts'],
    ['./users.js', 'users.ts'],
    ['../data/users', 'data/users.ts'],
  ])(
    'answers %s with the TypeScript file itself, short-circuiting the default resolver',
    (specifier, file) => {
      const dir = tmp()
      mkdirSync(path.join(dir, 'data'))
      mkdirSync(path.join(dir, 'nested'))
      writeFileSync(path.join(dir, 'users.ts'), 'export const users = []\n')
      writeFileSync(path.join(dir, 'data', 'users.ts'), 'export const users = []\n')
      const spy = recorder()
      const parent = pathToFileURL(
        path.join(dir, specifier.startsWith('../') ? 'nested/config.ts' : 'config.ts'),
      ).href
      expect(resolveTypeScript(specifier, { parentURL: parent }, spy.next)).toStrictEqual({
        url: pathToFileURL(path.join(dir, file)).href,
        shortCircuit: true,
      })
      expect(spy.calls).toStrictEqual([])
    },
  )

  it('prefers .ts, then .mts, then .js, then .mjs, then index files', () => {
    const dir = tmp()
    const parent = pathToFileURL(path.join(dir, 'config.ts')).href
    const resolve = (specifier: string) =>
      resolveTypeScript(specifier, { parentURL: parent }, recorder().next).url
    writeFileSync(path.join(dir, 'a.mjs'), '')
    expect(resolve('./a')).toBe(pathToFileURL(path.join(dir, 'a.mjs')).href)
    writeFileSync(path.join(dir, 'a.js'), '')
    expect(resolve('./a')).toBe(pathToFileURL(path.join(dir, 'a.js')).href)
    writeFileSync(path.join(dir, 'a.mts'), '')
    expect(resolve('./a')).toBe(pathToFileURL(path.join(dir, 'a.mts')).href)
    writeFileSync(path.join(dir, 'a.ts'), '')
    expect(resolve('./a')).toBe(pathToFileURL(path.join(dir, 'a.ts')).href)
    mkdirSync(path.join(dir, 'lib'))
    writeFileSync(path.join(dir, 'lib', 'index.js'), '')
    expect(resolve('./lib')).toBe(pathToFileURL(path.join(dir, 'lib', 'index.js')).href)
    writeFileSync(path.join(dir, 'lib', 'index.ts'), '')
    expect(resolve('./lib')).toBe(pathToFileURL(path.join(dir, 'lib', 'index.ts')).href)
  })

  it('leaves a relative specifier to Node when no candidate exists, so the usual error is raised', () => {
    const dir = tmp()
    const spy = recorder()
    const parent = pathToFileURL(path.join(dir, 'config.ts')).href
    expect(resolveTypeScript('./missing', { parentURL: parent }, spy.next)).toStrictEqual({
      url: './missing',
    })
    expect(spy.calls).toStrictEqual(['./missing'])
  })

  it('leaves a relative specifier alone when there is no file: parent to resolve it against', () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'users.ts'), '')
    const spy = recorder()
    expect(resolveTypeScript('./users', { parentURL: undefined }, spy.next)).toStrictEqual({
      url: './users',
    })
    expect(
      resolveTypeScript('./users', { parentURL: 'data:text/javascript,export{}' }, spy.next),
    ).toStrictEqual({ url: './users' })
    expect(spy.calls).toStrictEqual(['./users', './users'])
  })

  it('resolves an absolute file: specifier without an extension, as the client discovery imports one', () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'client.ts'), '')
    const spy = recorder()
    const bare = pathToFileURL(path.join(dir, 'client')).href
    expect(resolveTypeScript(bare, { parentURL: undefined }, spy.next)).toStrictEqual({
      url: pathToFileURL(path.join(dir, 'client.ts')).href,
      shortCircuit: true,
    })
    const exact = pathToFileURL(path.join(dir, 'client.ts')).href
    expect(resolveTypeScript(exact, { parentURL: undefined }, spy.next)).toStrictEqual({
      url: exact,
    })
    expect(spy.calls).toStrictEqual([exact])
  })

  it('does not treat a directory as a file: ./data with data/ but no index falls through', () => {
    const dir = tmp()
    mkdirSync(path.join(dir, 'data'))
    const spy = recorder()
    const parent = pathToFileURL(path.join(dir, 'config.ts')).href
    expect(resolveTypeScript('./data', { parentURL: parent }, spy.next)).toStrictEqual({
      url: './data',
    })
  })
})

describe('withTypeScriptImports', () => {
  // Inside vitest every `import()` goes through Vite's own resolver, which reads TypeScript
  // without extensions anyway; so the hook is exercised in a plain Node.js process, importing the
  // source module directly (Node 24 strips the types).
  it('lets TypeScript and CommonJS modules import siblings without an extension while the effect runs, and not before or after', () => {
    const dir = tmp()
    const packageDir = path.resolve(import.meta.dirname, '../..')
    writeFileSync(path.join(dir, 'tags.ts'), 'export const tags: string[] = ["a", "b"]\n')
    writeFileSync(
      path.join(dir, 'inside.ts'),
      'import { tags } from "./tags"\nexport const count: number = tags.length\n',
    )
    writeFileSync(
      path.join(dir, 'before.ts'),
      'import { tags } from "./tags"\nexport const count: number = tags.length\n',
    )
    writeFileSync(
      path.join(dir, 'after.ts'),
      'import { tags } from "./tags"\nexport const count: number = tags.length\n',
    )
    mkdirSync(path.join(dir, 'lib'))
    writeFileSync(path.join(dir, 'lib', 'database.js'), 'module.exports = { kind: "db" }\n')
    writeFileSync(
      path.join(dir, 'index.cjs'),
      'const db = require("./lib/database")\nmodule.exports = { db }\n',
    )
    writeFileSync(
      path.join(dir, 'probe.mjs'),
      `import { createRequire } from 'node:module'
import { withTypeScriptImports } from ${JSON.stringify(path.join(packageDir, 'src/seed/resolve.ts'))}
const { Effect } = createRequire(${JSON.stringify(path.join(packageDir, 'package.json'))})('effect')
const attempt = (file) => import(file).then((m) => m.count, (error) => error.code)
const before = await attempt('./before.ts')
const inside = await Effect.runPromise(withTypeScriptImports(Effect.promise(() => attempt('./inside.ts'))))
const cjs = await Effect.runPromise(withTypeScriptImports(Effect.promise(() => import('./index.cjs'))))
const failed = await Effect.runPromiseExit(withTypeScriptImports(Effect.fail('boom')))
const after = await attempt('./after.ts')
console.log(JSON.stringify({ before, inside, cjs: cjs.default.db, failed: failed._tag, after }))
`,
    )
    const run = spawnSync(process.execPath, ['probe.mjs'], { cwd: dir, encoding: 'utf8' })
    expect(run.stderr.replaceAll(/\(node:\d+\) .*\n(\(Use .*\)\n)?/gu, '')).toBe('')
    expect(JSON.parse(run.stdout)).toStrictEqual({
      before: 'ERR_MODULE_NOT_FOUND',
      inside: 2,
      cjs: { kind: 'db' },
      failed: 'Failure',
      after: 'ERR_MODULE_NOT_FOUND',
    })
  })
})
