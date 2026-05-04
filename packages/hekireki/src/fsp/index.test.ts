import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'

import { mkdir, readFileSync, writeFile, writeFileBinary } from '.'

// Test run
// pnpm vitest run ./src/fsp/index.test.ts

const TEST_DIR = path.join(process.cwd(), 'test-tmp-fsp-dir')

describe('fsp', () => {
  afterEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fsp.rm(TEST_DIR, { recursive: true })
    }
  })

  describe('mkdir', () => {
    it('returns ok when directory is created', async () => {
      const result = await mkdir(TEST_DIR)
      expect(result).toStrictEqual({ ok: true, value: undefined })
      expect(fs.existsSync(TEST_DIR)).toBe(true)
    })

    it('returns ok when directory already exists (recursive:true)', async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true })
      const result = await mkdir(TEST_DIR)
      expect(result).toStrictEqual({ ok: true, value: undefined })
    })

    it('creates nested directories', async () => {
      const nested = path.join(TEST_DIR, 'a', 'b', 'c')
      const result = await mkdir(nested)
      expect(result).toStrictEqual({ ok: true, value: undefined })
      expect(fs.existsSync(nested)).toBe(true)
    })

    it('returns err for invalid path (file exists at path)', async () => {
      const filePath = path.join(TEST_DIR, 'foo.txt')
      await fsp.mkdir(TEST_DIR, { recursive: true })
      await fsp.writeFile(filePath, 'dummy')
      const badPath = path.join(filePath, 'bar')
      const result = await mkdir(badPath)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(typeof result.error).toBe('string')
        expect(result.error.length > 0).toBe(true)
      }
    })
  })

  describe('writeFile', () => {
    beforeEach(async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true })
    })

    it('writes file successfully and returns ok', async () => {
      const filePath = path.join(TEST_DIR, 'ok.txt')
      const result = await writeFile(filePath, 'hello')
      expect(result).toStrictEqual({ ok: true, value: undefined })
      const text = await fsp.readFile(filePath, 'utf-8')
      expect(text).toBe('hello')
    })

    it('overwrites existing file', async () => {
      const filePath = path.join(TEST_DIR, 'overwrite.txt')
      await writeFile(filePath, 'first')
      await writeFile(filePath, 'second')
      const text = await fsp.readFile(filePath, 'utf-8')
      expect(text).toBe('second')
    })

    it('returns err for invalid path', async () => {
      const filePath = path.join(TEST_DIR, 'foo.txt')
      await fsp.writeFile(filePath, 'dummy')
      const badPath = path.join(filePath, 'bar.txt')
      const result = await writeFile(badPath, 'fail')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(typeof result.error).toBe('string')
        expect(result.error.length > 0).toBe(true)
      }
    })
  })

  describe('writeFileBinary', () => {
    beforeEach(async () => {
      await fsp.mkdir(TEST_DIR, { recursive: true })
    })

    it('writes binary data successfully and returns ok', async () => {
      const filePath = path.join(TEST_DIR, 'binary.bin')
      const data = Buffer.from([0x89, 0x50, 0x4e, 0x47])
      const result = await writeFileBinary(filePath, data)
      expect(result).toStrictEqual({ ok: true, value: undefined })
      const content = fs.readFileSync(filePath)
      expect(content[0]).toBe(0x89)
      expect(content[1]).toBe(0x50)
      expect(content[2]).toBe(0x4e)
      expect(content[3]).toBe(0x47)
      expect(content.length).toBe(4)
    })

    it('returns err for invalid path', async () => {
      const filePath = path.join(TEST_DIR, 'foo.txt')
      await fsp.writeFile(filePath, 'dummy')
      const badPath = path.join(filePath, 'bad.bin')
      const result = await writeFileBinary(badPath, Buffer.from([0x00]))
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(typeof result.error).toBe('string')
        expect(result.error.length > 0).toBe(true)
      }
    })
  })
})

describe('readFileSync', () => {
  const testFilePath = path.join(TEST_DIR, 'test-file.txt')
  const nonExistentPath = path.join(TEST_DIR, 'no-such-file.txt')

  beforeAll(async () => {
    await fsp.mkdir(TEST_DIR, { recursive: true })
    fs.writeFileSync(testFilePath, 'hello world', 'utf-8')
  })

  afterAll(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fsp.rm(TEST_DIR, { recursive: true })
    }
  })

  it('returns ok with content for existing file', () => {
    const result = readFileSync(testFilePath)
    expect(result).toStrictEqual({ ok: true, value: 'hello world' })
  })

  it('returns err for non-existent file', () => {
    const result = readFileSync(nonExistentPath)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length > 0).toBe(true)
    }
  })

  it('reads empty file correctly', () => {
    const emptyFilePath = path.join(TEST_DIR, 'empty.txt')
    fs.writeFileSync(emptyFilePath, '', 'utf-8')
    const result = readFileSync(emptyFilePath)
    expect(result).toStrictEqual({ ok: true, value: '' })
  })

  it('reads UTF-8 content with multibyte characters', () => {
    const utfFilePath = path.join(TEST_DIR, 'utf8.txt')
    fs.writeFileSync(utfFilePath, '日本語テスト 🚀', 'utf-8')
    const result = readFileSync(utfFilePath)
    expect(result).toStrictEqual({ ok: true, value: '日本語テスト 🚀' })
  })
})
