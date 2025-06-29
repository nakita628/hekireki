#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { format } from 'prettier'
import fs from 'node:fs'
import { zod } from './generator/zod.js'
import pkg from '@prisma/generator-helper'
const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './zod'
  const fileName = options.generator.config?.file ?? 'index.ts'

  const content = zod(
    options.dmmf.datamodel.models,
    options.generator.config?.type === 'true' ? true : false,
    options.generator.config?.comment === 'true' ? true : false,
  )
  const code = await format(content, {
    parser: 'typescript',
    printWidth: 100,
    singleQuote: true,
    semi: false,
  })

  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true })
  }

  const file = fileName ?? 'index.ts'
  const filePath = `${output}/${file}`
  fs.writeFileSync(filePath, code)
}
generatorHandler({
  onManifest() {
    return {
      defaultOutput: './zod/',
      prettyName: 'Hekireki-Zod',
    }
  },
  onGenerate: main,
})
