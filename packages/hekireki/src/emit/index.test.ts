import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { fileSystemLayer } from '../file/index.js'
import { FormatError } from '../format/index.js'
import { emit, emitMany, emitRaw } from './index.js'

const TEST_DIR = path.join(process.cwd(), 'test-tmp-emit-dir')

afterEach(async () => {
  if (fs.existsSync(TEST_DIR)) {
    await fsp.rm(TEST_DIR, { recursive: true })
  }
})

const run = <A, E>(effect: Effect.Effect<A, E, Effect.Services<ReturnType<typeof emit>>>) =>
  Effect.runPromise(Effect.provide(effect, fileSystemLayer))

describe('emit', () => {
  it('formats and writes a TS file', async () => {
    const file = path.join(TEST_DIR, 'out.ts')
    await run(emit('const x = "x";', TEST_DIR, file))
    expect(await fsp.readFile(file, 'utf-8')).toBe(`const x = 'x'\n`)
  })

  it('fails with FormatError on invalid TS source', async () => {
    const error = await run(
      Effect.flip(emit('const x = {', TEST_DIR, path.join(TEST_DIR, 'bad.ts'))),
    )
    expect(error).toBeInstanceOf(FormatError)
  })

  it('fails with a platform error when the directory cannot be created', async () => {
    await fsp.mkdir(TEST_DIR, { recursive: true })
    const blocker = path.join(TEST_DIR, 'blocker')
    await fsp.writeFile(blocker, 'x')
    const error = await run(
      Effect.flip(
        emit('const x = 1', path.join(blocker, 'sub'), path.join(blocker, 'sub', 'a.ts')),
      ),
    )
    expect(error).not.toBeInstanceOf(FormatError)
    expect(error.message).toContain('makeDirectory')
  })
})

describe('emitRaw', () => {
  it('writes plain string content without formatting', async () => {
    const file = path.join(TEST_DIR, 'plain.txt')
    await run(emitRaw('hello\nworld', TEST_DIR, file))
    expect(await fsp.readFile(file, 'utf-8')).toBe('hello\nworld')
  })

  it('writes bytes as binary', async () => {
    const file = path.join(TEST_DIR, 'data.bin')
    await run(emitRaw(new Uint8Array([0x01, 0x02, 0x03]), TEST_DIR, file))
    expect([...fs.readFileSync(file)]).toStrictEqual([0x01, 0x02, 0x03])
  })
})

describe('emitMany', () => {
  it('writes every file into the directory', async () => {
    await run(
      emitMany(
        [
          { fileName: 'a.ts', code: 'a' },
          { fileName: 'b.ts', code: 'b' },
        ],
        TEST_DIR,
      ),
    )
    expect(await fsp.readFile(path.join(TEST_DIR, 'a.ts'), 'utf-8')).toBe('a')
    expect(await fsp.readFile(path.join(TEST_DIR, 'b.ts'), 'utf-8')).toBe('b')
  })
})
