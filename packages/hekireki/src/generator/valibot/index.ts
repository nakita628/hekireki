#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { valibot } from '../../core/valibot.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Valibot',
    }
  },
  onGenerate: valibot,
})
