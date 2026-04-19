#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { dbml } from '../../core/dbml.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-DBML',
    }
  },
  onGenerate: dbml,
})
