#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { arktype } from '../../core/arktype.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-ArkType',
    }
  },
  onGenerate: arktype,
})
