import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { mkdir, writeFile, writeFileBinary } from './index.js'

// Test run
// pnpm vitest run ./src/fsp/index.test.ts

describe('mkdir', () => {
  const tmpDir = path.join(os.tmpdir(), 'hekireki-fsp-test-mkdir')

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a directory recursively', async () => {
    const target = path.join(tmpDir, 'a', 'b', 'c')
    const result = await mkdir(target)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.existsSync(target)).toBe(true)
  })

  it('succeeds when directory already exists', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const result = await mkdir(tmpDir)
    expect(result).toStrictEqual({ ok: true, value: undefined })
  })
})

describe('writeFile', () => {
  const tmpDir = path.join(os.tmpdir(), 'hekireki-fsp-test-writefile')

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes text content to a file', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'test.txt')
    const result = await writeFile(filePath, 'hello hekireki')
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello hekireki')
  })

  it('returns error for invalid path', async () => {
    const result = await writeFile('/nonexistent/deep/path/file.txt', 'data')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('overwrites existing file content', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'overwrite.txt')
    await writeFile(filePath, 'first')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('first')
    const result = await writeFile(filePath, 'second')
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('second')
  })

  it('writes empty string', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'empty.txt')
    const result = await writeFile(filePath, '')
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('')
  })

  it('writes UTF-8 content correctly', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'utf8.txt')
    const content = 'アーニャ、わくわく！🎀'
    const result = await writeFile(filePath, content)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content)
  })
})

describe('writeFileBinary', () => {
  const tmpDir = path.join(os.tmpdir(), 'hekireki-fsp-test-writebinary')

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes binary content to a file', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'test.bin')
    const buf = Buffer.from([0x00, 0x01, 0x02, 0xff])
    const result = await writeFileBinary(filePath, buf)
    expect(result).toStrictEqual({ ok: true, value: undefined })
    const written = fs.readFileSync(filePath)
    expect(Buffer.compare(written, buf)).toBe(0)
  })

  it('returns error for invalid path', async () => {
    const result = await writeFileBinary('/nonexistent/deep/path/file.bin', Buffer.from([0x00]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  it('writes empty buffer', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'empty.bin')
    const result = await writeFileBinary(filePath, Buffer.alloc(0))
    expect(result).toStrictEqual({ ok: true, value: undefined })
    const written = fs.readFileSync(filePath)
    expect(written.length).toBe(0)
  })
})
