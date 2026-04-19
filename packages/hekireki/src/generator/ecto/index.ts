#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { ecto } from '../../core/ecto.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-Ecto',
    }
  },
  onGenerate: ecto,
})
