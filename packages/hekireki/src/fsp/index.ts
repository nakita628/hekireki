import fs from 'node:fs'
import fsp from 'node:fs/promises'

export function readFileSync(path: string) {
  try {
    const result = fs.readFileSync(path, 'utf-8')
    return { ok: true, value: result } as const
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
  }
}

export async function mkdir(dir: string) {
  try {
    await fsp.mkdir(dir, { recursive: true })
    return { ok: true, value: undefined } as const
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
  }
}

export async function writeFile(path: string, data: string) {
  try {
    await fsp.writeFile(path, data, 'utf-8')
    return { ok: true, value: undefined } as const
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
  }
}

export async function writeFileBinary(path: string, data: Buffer) {
  try {
    await fsp.writeFile(path, data)
    return { ok: true, value: undefined } as const
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) } as const
  }
}
