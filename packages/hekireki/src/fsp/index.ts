import fsp from 'node:fs/promises'

export async function mkdir(
  dir: string,
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  try {
    await fsp.mkdir(dir, { recursive: true })
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function writeFile(
  path: string,
  data: string,
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  try {
    await fsp.writeFile(path, data, 'utf-8')
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function writeFileBinary(
  path: string,
  data: Buffer,
): Promise<
  { readonly ok: true; readonly value: undefined } | { readonly ok: false; readonly error: string }
> {
  try {
    await fsp.writeFile(path, data)
    return { ok: true, value: undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
