import pkg from '@prisma/generator-helper'
import { Effect } from 'effect'

import { activerecord } from '../core/activerecord.js'
import { ajv } from '../core/ajv.js'
import { arktype } from '../core/arktype.js'
import { atlas } from '../core/atlas.js'
import { django } from '../core/django.js'
import { drizzle } from '../core/drizzle.js'
import { ecto } from '../core/ecto.js'
import { effect } from '../core/effect.js'
import { eloquent } from '../core/eloquent.js'
import { er } from '../core/er.js'
import { gorm } from '../core/gorm.js'
import { kysely } from '../core/kysely.js'
import { pydantic } from '../core/pydantic.js'
import { seaOrm } from '../core/sea-orm.js'
import { sqlalchemy } from '../core/sqlalchemy.js'
import { typebox } from '../core/typebox.js'
import { valibot } from '../core/valibot.js'
import { zod } from '../core/zod.js'
import { fileSystemLayer } from '../file/index.js'

const GENERATORS = {
  activerecord: { prettyName: 'Hekireki-ActiveRecord', handler: activerecord },
  ajv: { prettyName: 'Hekireki-AJV', handler: ajv },
  arktype: { prettyName: 'Hekireki-ArkType', handler: arktype },
  atlas: { prettyName: 'Hekireki-Atlas', handler: atlas },
  // One ER model, four renderings, picked by the extension of `output`.
  er: { prettyName: 'Hekireki-ER', handler: er },
  django: { prettyName: 'Hekireki-Django', handler: django },
  drizzle: { prettyName: 'Hekireki-Drizzle', handler: drizzle },
  ecto: { prettyName: 'Hekireki-Ecto', handler: ecto },
  effect: { prettyName: 'Hekireki-Effect', handler: effect },
  eloquent: { prettyName: 'Hekireki-Eloquent', handler: eloquent },
  gorm: { prettyName: 'Hekireki-GORM', handler: gorm },
  kysely: { prettyName: 'Hekireki-Kysely', handler: kysely },
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
    onGenerate(options) {
      return Effect.runPromise(
        handler(options).pipe(
          Effect.mapError((error) => new Error(error.message)),
          Effect.provide(fileSystemLayer),
        ),
      )
    },
  })
}
