#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { sqlalchemy } from '../../core/sqlalchemy.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-SQLAlchemy',
    }
  },
  onGenerate: sqlalchemy,
})
