import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vite-plus/test'

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
    await mkdir(target)
    expect(fs.existsSync(target)).toBe(true)
  })

  it('succeeds when directory already exists', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    await expect(mkdir(tmpDir)).resolves.toBeUndefined()
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
    await writeFile(filePath, 'hello hekireki')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello hekireki')
  })

  it('throws for invalid path', async () => {
    await expect(writeFile('/nonexistent/deep/path/file.txt', 'data')).rejects.toThrow()
  })

  it('overwrites existing file content', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'overwrite.txt')
    await writeFile(filePath, 'first')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('first')
    await writeFile(filePath, 'second')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('second')
  })

  it('writes empty string', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'empty.txt')
    await writeFile(filePath, '')
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('')
  })

  it('writes UTF-8 content correctly', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'utf8.txt')
    const content = 'hekireki'
    await writeFile(filePath, content)
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
    await writeFileBinary(filePath, buf)
    const written = fs.readFileSync(filePath)
    expect(Buffer.compare(written, buf)).toBe(0)
  })

  it('throws for invalid path', async () => {
    await expect(
      writeFileBinary('/nonexistent/deep/path/file.bin', Buffer.from([0x00])),
    ).rejects.toThrow()
  })

  it('writes empty buffer', async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const filePath = path.join(tmpDir, 'empty.bin')
    await writeFileBinary(filePath, Buffer.alloc(0))
    const written = fs.readFileSync(filePath)
    expect(written.length).toBe(0)
  })
})
