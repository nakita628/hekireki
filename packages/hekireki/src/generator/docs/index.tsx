#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import pkg from '@prisma/generator-helper'
import { requireOutput } from '../../utils/index.js'
import { transformDMMF } from './generator/transformDMMF.js'
import { generateHTML } from './printer/index.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Docs',
    }
  },
  async onGenerate(options) {
    const dmmf = transformDMMF(options.dmmf)
    const html = await generateHTML(dmmf)

    const output = requireOutput(options.generator.output?.value, 'Hekireki-Docs', options.generator.isCustomOutput)

    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'index.html'), html)
  },
})
