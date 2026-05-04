import pkg from '@prisma/generator-helper'

import { ajv } from '../core/ajv.js'
import { arktype } from '../core/arktype.js'
import { dbml } from '../core/dbml.js'
import { docs } from '../core/docs.js'
import { drizzle } from '../core/drizzle.js'
import { ecto } from '../core/ecto.js'
import { effect } from '../core/effect.js'
import { gorm } from '../core/gorm.js'
import { mermaidEr } from '../core/mermaid-er.js'
import { seaOrm } from '../core/sea-orm.js'
import { sqlalchemy } from '../core/sqlalchemy.js'
import { typebox } from '../core/typebox.js'
import { valibot } from '../core/valibot.js'
import { zod } from '../core/zod.js'

const GENERATORS = {
  ajv: { prettyName: 'Hekireki-AJV', handler: ajv },
  arktype: { prettyName: 'Hekireki-ArkType', handler: arktype },
  dbml: { prettyName: 'Hekireki-DBML', handler: dbml },
  docs: { prettyName: 'Hekireki-Docs', handler: docs },
  drizzle: { prettyName: 'Hekireki-Drizzle', handler: drizzle },
  ecto: { prettyName: 'Hekireki-Ecto', handler: ecto },
  effect: { prettyName: 'Hekireki-Effect', handler: effect },
  gorm: { prettyName: 'Hekireki-GORM', handler: gorm },
  'mermaid-er': { prettyName: 'Hekireki-ER', handler: mermaidEr },
  'sea-orm': { prettyName: 'Hekireki-SeaORM', handler: seaOrm },
  sqlalchemy: { prettyName: 'Hekireki-SQLAlchemy', handler: sqlalchemy },
  typebox: { prettyName: 'Hekireki-TypeBox', handler: typebox },
  valibot: { prettyName: 'Hekireki-Valibot', handler: valibot },
  zod: { prettyName: 'Hekireki-Zod', handler: zod },
} as const

export function registerGenerator(
  name:
    | 'ajv'
    | 'arktype'
    | 'dbml'
    | 'docs'
    | 'drizzle'
    | 'ecto'
    | 'effect'
    | 'gorm'
    | 'mermaid-er'
    | 'sea-orm'
    | 'sqlalchemy'
    | 'typebox'
    | 'valibot'
    | 'zod',
) {
  const { prettyName, handler } = GENERATORS[name]
  pkg.generatorHandler({
    onManifest() {
      return { defaultOutput: '.', prettyName }
    },
    async onGenerate(options) {
      const result = await handler(options)
      if (!result.ok) throw new Error(result.error)
    },
  })
}
