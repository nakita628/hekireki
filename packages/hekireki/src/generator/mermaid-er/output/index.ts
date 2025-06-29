import type { ERContent } from '../types.js'
import fs from 'node:fs'

/**
 * Output the ER content to a file
 * @param content - The ER content
 * @param config - The configuration
 */
export function output(content: ERContent, output: string, file: string | string[]): void {
  const outputDir = output
  if (!outputDir) {
    throw new Error('output is required')
  }
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const fileName = file ?? 'ER.md'

  const filePath = `${outputDir}/${fileName}`
  fs.writeFileSync(filePath, content.join('\n'), { encoding: 'utf-8' })
}
