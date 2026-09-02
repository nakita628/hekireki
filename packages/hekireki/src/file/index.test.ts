import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { Effect, Fiber, Stream } from 'effect'
import type { FileSystem, PlatformError } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import {
  exists,
  fileSystemLayer,
  isDirectory,
  makeDirectory,
  readDirectory,
  readFile,
  watch,
  writeFile,
} from './index.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function tmp() {
  const dir = mkdtempSync(path.join(tmpdir(), 'hekireki-file-'))
  dirs.push(dir)
  return dir
}

function run<A>(effect: Effect.Effect<A, PlatformError.PlatformError, FileSystem.FileSystem>) {
  return Effect.runPromise(Effect.provide(effect, fileSystemLayer))
}

function fail(effect: Effect.Effect<unknown, PlatformError.PlatformError, FileSystem.FileSystem>) {
  return Effect.runPromise(Effect.provide(Effect.flip(effect), fileSystemLayer))
}

describe('readFile', () => {
  it('reads UTF-8 text, including multibyte characters and empty files', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'a.txt'), 'こんにちは 🌏')
    writeFileSync(path.join(dir, 'empty.txt'), '')
    expect(await run(readFile(path.join(dir, 'a.txt')))).toBe('こんにちは 🌏')
    expect(await run(readFile(path.join(dir, 'empty.txt')))).toBe('')
  })

  it('fails with a NotFound platform error for a missing file', async () => {
    const error = await fail(readFile(path.join(tmp(), 'missing.txt')))
    expect(error.message).toContain('NotFound')
    expect(error.message).toContain('missing.txt')
  })
})

describe('writeFile and makeDirectory', () => {
  it('writes text and bytes into a directory created with its parents', async () => {
    const dir = tmp()
    const nested = path.join(dir, 'a', 'b')
    await run(makeDirectory(nested))
    await run(makeDirectory(nested))
    await run(writeFile(path.join(nested, 'text.txt'), 'hello'))
    await run(writeFile(path.join(nested, 'bytes.bin'), new Uint8Array([1, 2, 3])))
    expect(readFileSync(path.join(nested, 'text.txt'), 'utf-8')).toBe('hello')
    expect([...readFileSync(path.join(nested, 'bytes.bin'))]).toStrictEqual([1, 2, 3])
    expect(statSync(nested).isDirectory()).toBe(true)
  })

  it('fails when the parent directory does not exist', async () => {
    const error = await fail(writeFile(path.join(tmp(), 'nope', 'x.txt'), 'x'))
    expect(error.message).toContain('NotFound')
  })
})

describe('readDirectory, exists and isDirectory', () => {
  it('lists entries and tells files from directories', async () => {
    const dir = tmp()
    writeFileSync(path.join(dir, 'schema.prisma'), '')
    await run(makeDirectory(path.join(dir, 'sub')))
    const names = await run(readDirectory(dir))
    expect(new Set(names)).toStrictEqual(new Set(['schema.prisma', 'sub']))
    expect(await run(isDirectory(dir))).toBe(true)
    expect(await run(isDirectory(path.join(dir, 'schema.prisma')))).toBe(false)
    expect(await run(exists(path.join(dir, 'schema.prisma')))).toBe(true)
    expect(await run(exists(path.join(dir, 'missing')))).toBe(false)
  })

  it('isDirectory fails for a missing path', async () => {
    const error = await fail(isDirectory(path.join(tmp(), 'missing')))
    expect(error.message).toContain('NotFound')
  })
})

describe('watch', () => {
  it('emits an event with the file name when a file in the directory changes', async () => {
    const dir = tmp()
    const file = path.join(dir, 'schema.prisma')
    writeFileSync(file, 'a')
    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* watch(dir).pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        yield* Effect.sleep('200 millis')
        writeFileSync(file, 'b')
        return yield* Fiber.join(fiber).pipe(Effect.timeout('3 seconds'))
      }).pipe(Effect.provide(fileSystemLayer)),
    )
    expect([...events].map((e) => e.path)).toStrictEqual(['schema.prisma'])
  })

  it('fails for a missing directory', async () => {
    const error = await fail(Stream.runDrain(watch(path.join(tmp(), 'missing'))))
    expect(error.message).toContain('NotFound')
  })
})
