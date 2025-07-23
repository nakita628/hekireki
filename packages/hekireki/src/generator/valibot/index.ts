#!/usr/bin/env node
import fsp from 'node:fs/promises'
import type { GeneratorOptions } from '@prisma/generator-helper'
import pkg from '@prisma/generator-helper'
import { fmt } from '../../shared/format/index.js'
import { valibot } from './generator/valibot.js'

const { generatorHandler } = pkg

export async function main(options: GeneratorOptions): Promise<void> {
  const output = options.generator.output?.value ?? './valibot'
  const file = options.generator.config?.file ?? 'index.ts'
  const content = valibot(
    options.dmmf.datamodel.models,
    options.generator.config?.type === 'true',
    options.generator.config?.comment === 'true',
  )
  const code = await fmt(content)
  await fsp.mkdir(output, { recursive: true })
  await fsp.writeFile(`${output}/${file}`, code, { encoding: 'utf-8' })
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
