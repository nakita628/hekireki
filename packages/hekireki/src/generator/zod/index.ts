#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import fs from 'node:fs'
import { zod } from './generator/zod.js'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './zod'
  const fileName = options.generator.config?.file ?? 'index.ts'
  const zodVersion = options.generator.config?.zod ?? 'v4'

  const content = zod(
    options.dmmf.datamodel.models,
    options.generator.config?.type === 'true',
    options.generator.config?.comment === 'true',
    zodVersion,
  )
  const code = await fmt(content)

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
