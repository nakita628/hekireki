import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

import { emit, emitMany, emitRaw } from './index.js'

// Test run
// pnpm vitest run ./src/emit/index.test.ts

const TEST_DIR = path.join(process.cwd(), 'test-tmp-emit-dir')

afterEach(async () => {
  if (fs.existsSync(TEST_DIR)) {
    await fsp.rm(TEST_DIR, { recursive: true })
  }
})

describe('emit', () => {
  it('formats and writes a TS file', async () => {
    const file = path.join(TEST_DIR, 'out.ts')
    const result = await emit('const x = "x";', TEST_DIR, file)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    const content = await fsp.readFile(file, 'utf-8')
    expect(content).toBe(`const x = 'x'\n`)
  })

  it('returns err on invalid TS source', async () => {
    const file = path.join(TEST_DIR, 'bad.ts')
    const result = await emit('const x = {', TEST_DIR, file)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length > 0).toBe(true)
    }
  })

  it('returns err when dir is unwritable', async () => {
    await fsp.mkdir(TEST_DIR, { recursive: true })
    const blocker = path.join(TEST_DIR, 'blocker')
    await fsp.writeFile(blocker, 'x')
    const result = await emit(
      'const x = 1',
      path.join(blocker, 'sub'),
      path.join(blocker, 'sub', 'a.ts'),
    )
    expect(result.ok).toBe(false)
  })
})

describe('emitRaw', () => {
  it('writes plain string content without formatting', async () => {
    const file = path.join(TEST_DIR, 'plain.txt')
    const result = await emitRaw('hello\nworld', TEST_DIR, file)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    const content = await fsp.readFile(file, 'utf-8')
    expect(content).toBe('hello\nworld')
  })

  it('writes Buffer content as binary', async () => {
    const file = path.join(TEST_DIR, 'data.bin')
    const buf = Buffer.from([0x01, 0x02, 0x03])
    const result = await emitRaw(buf, TEST_DIR, file)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    const content = fs.readFileSync(file)
    expect(content[0]).toBe(0x01)
    expect(content[1]).toBe(0x02)
    expect(content[2]).toBe(0x03)
    expect(content.length).toBe(3)
  })
})

describe('emitMany', () => {
  it('writes multiple files into a directory', async () => {
    const result = await emitMany(
      [
        { fileName: 'a.txt', code: 'A' },
        { fileName: 'b.txt', code: 'B' },
      ],
      TEST_DIR,
    )
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(await fsp.readFile(path.join(TEST_DIR, 'a.txt'), 'utf-8')).toBe('A')
    expect(await fsp.readFile(path.join(TEST_DIR, 'b.txt'), 'utf-8')).toBe('B')
  })

  it('handles empty file list', async () => {
    const result = await emitMany([], TEST_DIR)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.existsSync(TEST_DIR)).toBe(true)
  })
})
