import fsp from 'node:fs/promises'

export async function mkdir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true })
}

export async function writeFile(path: string, data: string): Promise<void> {
  await fsp.writeFile(path, data, 'utf-8')
}

export async function writeFileBinary(path: string, data: Buffer): Promise<void> {
  await fsp.writeFile(path, data)
}
