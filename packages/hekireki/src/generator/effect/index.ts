#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { effect } from '../../core/effect.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Effect',
    }
  },
  onGenerate: effect,
})
