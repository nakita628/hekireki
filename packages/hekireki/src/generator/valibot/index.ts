#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { format } from 'prettier'
import fs from 'node:fs'
import { valibot } from './generator/valibot.js'
import pkg from '@prisma/generator-helper'
const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './valibot'
  const fileName = options.generator.config?.file ?? 'index.ts'

  const content = valibot(
    options.dmmf.datamodel.models,
    options.generator.config?.type === 'true',
    options.generator.config?.comment === 'true',
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
      defaultOutput: './valibot/',
      prettyName: 'Hekireki-Valibot',
    }
  },
  onGenerate: main,
})
