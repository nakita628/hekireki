#!/usr/bin/env node
import pkg from '@prisma/generator-helper'

import { mermaidEr } from '../../core/mermaid-er.js'

const { generatorHandler } = pkg

generatorHandler({
  onManifest() {
    return {
      defaultOutput: '.',
      prettyName: 'Hekireki-ER',
    }
  },
  onGenerate: mermaidEr,
})
