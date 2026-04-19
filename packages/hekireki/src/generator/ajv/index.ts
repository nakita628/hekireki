#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { ajv } from '../../core/ajv.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-AJV',
    }
  },
  onGenerate: ajv,
})
