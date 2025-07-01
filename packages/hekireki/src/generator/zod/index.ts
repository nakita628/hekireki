#!/usr/bin/env node
import type { GeneratorOptions } from '@prisma/generator-helper'
import { zod } from './generator/zod.js'
import fsp from 'fs/promises'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './zod'
  const file = options.generator.config?.file ?? 'index.ts'
  const zodVersion = options.generator.config?.zod ?? 'v4'
  const content = zod(
    options.dmmf.datamodel.models,
    options.generator.config?.type === 'true',
    options.generator.config?.comment === 'true',
    zodVersion,
  )
  const code = await fmt(content)
  await fsp.mkdir(output, { recursive: true })
  await fsp.writeFile(`${output}/${file}`, code, { encoding: 'utf-8' })
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
