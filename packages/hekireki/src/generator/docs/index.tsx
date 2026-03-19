#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

import pkg from '@prisma/generator-helper'

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
    if (!options.generator.isCustomOutput || !options.generator.output?.value) {
      throw new Error(
        'output is required for Hekireki-Docs. Please specify output in your generator config.',
      )
    }
    const output = options.generator.output.value

    const dmmf = transformDMMF(options.dmmf)
    const html = generateHTML(dmmf)

    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'index.html'), html)
  },
})
