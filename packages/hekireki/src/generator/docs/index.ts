#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import pkg from '@prisma/generator-helper'
import { transformDMMF } from './generator/transformDMMF.js'
import { HTMLPrinter } from './printer/index.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: './docs',
      prettyName: 'Hekireki-Docs',
    }
  },
  async onGenerate(options) {
    const { config } = options.generator
    const includeRelationFields = config.includeRelationFields !== 'false'

    const dmmf = transformDMMF(options.dmmf, { includeRelationFields })
    const html = new HTMLPrinter(dmmf)

    const output = options.generator.output?.value

    if (!output) {
      throw new Error('No output was specified for Hekireki Docs Generator')
    }

    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'index.html'), html.toHTML())
  },
})
