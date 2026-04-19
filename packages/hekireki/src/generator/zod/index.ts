#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { zod } from '../../core/zod.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Zod',
    }
  },
  onGenerate: zod,
})
