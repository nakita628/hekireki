#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { typebox } from '../../core/typebox.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-TypeBox',
    }
  },
  onGenerate: typebox,
})
