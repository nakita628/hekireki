import path from 'node:path'

import { fmt } from '../format/index.js'
import { mkdir, writeFile, writeFileBinary } from '../fsp/index.js'

export async function emit(code: string, dir: string, output: string) {
  const [fmtResult, mkdirResult] = await Promise.all([fmt(code), mkdir(dir)])
  if (!fmtResult.ok) return { ok: false, error: fmtResult.error } as const
  if (!mkdirResult.ok) return { ok: false, error: mkdirResult.error } as const
  const writeResult = await writeFile(output, fmtResult.value)
  if (!writeResult.ok) return { ok: false, error: writeResult.error } as const
  return { ok: true, value: undefined } as const
}

export async function emitRaw(data: string | Buffer, dir: string, output: string) {
  const mkdirResult = await mkdir(dir)
  if (!mkdirResult.ok) return { ok: false, error: mkdirResult.error } as const
  const writeResult =
    typeof data === 'string' ? await writeFile(output, data) : await writeFileBinary(output, data)
  if (!writeResult.ok) return { ok: false, error: writeResult.error } as const
  return { ok: true, value: undefined } as const
}

export async function emitMany(
  files: ReadonlyArray<{ readonly fileName: string; readonly code: string }>,
  dir: string,
) {
  const mkdirResult = await mkdir(dir)
  if (!mkdirResult.ok) return { ok: false, error: mkdirResult.error } as const
  const results = await Promise.all(files.map((f) => writeFile(path.join(dir, f.fileName), f.code)))
  for (const r of results) {
    if (!r.ok) return { ok: false, error: r.error } as const
  }
  return { ok: true, value: undefined } as const
}
