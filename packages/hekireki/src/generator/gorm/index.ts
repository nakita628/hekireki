#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { gorm } from '../../core/gorm.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-GORM',
    }
  },
  onGenerate: gorm,
})
