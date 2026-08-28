import pkg from '@prisma/generator-helper'

import { activerecord } from '../core/activerecord.js'
import { ajv } from '../core/ajv.js'
import { arktype } from '../core/arktype.js'
import { atlas } from '../core/atlas.js'
import { dbml } from '../core/dbml.js'
import { django } from '../core/django.js'
import { docs } from '../core/docs.js'
import { drizzle } from '../core/drizzle.js'
import { ecto } from '../core/ecto.js'
import { effect } from '../core/effect.js'
import { eloquent } from '../core/eloquent.js'
import { gorm } from '../core/gorm.js'
import { kysely } from '../core/kysely.js'
import { mermaidEr } from '../core/mermaid-er.js'
import { pydantic } from '../core/pydantic.js'
import { seaOrm } from '../core/sea-orm.js'
import { sqlalchemy } from '../core/sqlalchemy.js'
import { typebox } from '../core/typebox.js'
import { valibot } from '../core/valibot.js'
import { zod } from '../core/zod.js'

const GENERATORS = {
  activerecord: { prettyName: 'Hekireki-ActiveRecord', handler: activerecord },
  ajv: { prettyName: 'Hekireki-AJV', handler: ajv },
  arktype: { prettyName: 'Hekireki-ArkType', handler: arktype },
  atlas: { prettyName: 'Hekireki-Atlas', handler: atlas },
  dbml: { prettyName: 'Hekireki-DBML', handler: dbml },
  django: { prettyName: 'Hekireki-Django', handler: django },
  docs: { prettyName: 'Hekireki-Docs', handler: docs },
  drizzle: { prettyName: 'Hekireki-Drizzle', handler: drizzle },
  ecto: { prettyName: 'Hekireki-Ecto', handler: ecto },
  effect: { prettyName: 'Hekireki-Effect', handler: effect },
  eloquent: { prettyName: 'Hekireki-Eloquent', handler: eloquent },
  gorm: { prettyName: 'Hekireki-GORM', handler: gorm },
  kysely: { prettyName: 'Hekireki-Kysely', handler: kysely },
  'mermaid-er': { prettyName: 'Hekireki-ER', handler: mermaidEr },
  pydantic: { prettyName: 'Hekireki-Pydantic', handler: pydantic },
  'sea-orm': { prettyName: 'Hekireki-SeaORM', handler: seaOrm },
  sqlalchemy: { prettyName: 'Hekireki-SQLAlchemy', handler: sqlalchemy },
  typebox: { prettyName: 'Hekireki-TypeBox', handler: typebox },
  valibot: { prettyName: 'Hekireki-Valibot', handler: valibot },
  zod: { prettyName: 'Hekireki-Zod', handler: zod },
} as const

export function registerGenerator(name: keyof typeof GENERATORS) {
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
