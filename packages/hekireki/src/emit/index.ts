import path from 'node:path'

import { Effect } from 'effect'

import { makeDirectory, writeFile } from '../file/index.js'
import { fmt } from '../format/index.js'

/** Formats TypeScript source and writes it, creating the directory. */
export function emit(code: string, dir: string, output: string) {
  return Effect.gen(function* () {
    const formatted = yield* fmt(code)
    yield* makeDirectory(dir)
    yield* writeFile(output, formatted)
  })
}

/** Writes text or bytes as they are, creating the directory. */
export function emitRaw(data: string | Uint8Array, dir: string, output: string) {
  return Effect.gen(function* () {
    yield* makeDirectory(dir)
    yield* writeFile(output, data)
  })
}

/** Writes several files into one directory. */
export function emitMany(
  files: readonly { readonly fileName: string; readonly code: string }[],
  dir: string,
) {
  return Effect.gen(function* () {
    yield* makeDirectory(dir)
    yield* Effect.forEach(files, (f) => writeFile(path.join(dir, f.fileName), f.code), {
      discard: true,
    })
  })
}
