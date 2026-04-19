#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { drizzle } from '../../core/drizzle.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Drizzle',
    }
  },
  onGenerate: drizzle,
})
