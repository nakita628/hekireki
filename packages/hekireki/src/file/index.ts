import { Effect, FileSystem, Option, Stream } from 'effect'

export function readFile(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFileString(path)
  })
}

/** Reads a file as bytes. */
export function readBytes(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readFile(path)
  })
}

/** Writes text or bytes, replacing the file. */
export function writeFile(path: string, data: string | Uint8Array) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* typeof data === 'string'
      ? fs.writeFileString(path, data)
      : fs.writeFile(path, data)
  })
}

/** Creates the directory and its parents; an existing directory is not an error. */
export function makeDirectory(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.makeDirectory(path, { recursive: true })
  })
}

/**
 * Lists the entry names of a directory; with `recursive`, every entry below it too, as a path
 * relative to the directory.
 */
export function readDirectory(path: string, options?: { readonly recursive?: boolean }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.readDirectory(path, options)
  })
}

/** Whether the path exists at all. */
export function exists(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.exists(path)
  })
}

/** When a file last changed and how large it is, as one string; null when it is not there. */
export function fileStamp(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat(path)
    return `${Option.getOrUndefined(info.mtime)?.getTime() ?? ''}:${info.size}`
  }).pipe(Effect.orElseSucceed(() => null))
}

/** Whether the path is a directory; fails when it does not exist. */
export function isDirectory(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const info = yield* fs.stat(path)
    return info.type === 'Directory'
  })
}

/**
 * File events of a directory (paths are relative to it) or of a single file; with `recursive`,
 * of everything below the directory too.
 */
export function watch(path: string, options?: { readonly recursive?: boolean }) {
  return Stream.unwrap(Effect.map(FileSystem.FileSystem, (fs) => fs.watch(path, options)))
}

/** Removes a file or a directory and what it holds; nothing happens when it is not there. */
export function removePath(path: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* fs.remove(path, { recursive: true, force: true })
  })
}
