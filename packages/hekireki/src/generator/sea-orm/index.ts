#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { seaOrm } from '../../core/sea-orm.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-SeaORM',
    }
  },
  onGenerate: seaOrm,
})
