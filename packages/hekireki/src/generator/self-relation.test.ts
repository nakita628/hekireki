import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { activeRecordModelFiles } from './activerecord.js'
import { atlasSchema } from './atlas.js'
import { drizzleSchema } from './drizzle.js'
import { generateGormModels } from './gorm.js'
import { kyselySchema } from './kysely.js'
import { seaOrmFiles } from './sea-orm.js'
import { generateSingleFile } from './sqlalchemy.js'

const REPORTS = 'reports   Employee[] @relation("Mgr")'
const MANAGER_ID = 'managerId Int?'
const MANAGER = 'manager   Employee?  @relation("Mgr", fields: [managerId], references: [id])'

function datamodelOf(fields: readonly string[]) {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {\n  provider = "postgresql"\n}\nmodel Employee {\n  id Int @id @default(autoincrement())\n  ${fields.join('\n  ')}\n}\n`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

// A self one-to-many whose list end is declared before the foreign key: the list's other end is
// `manager`, not the list itself, so there is no implicit join table `_Mgr` to write.
const listFirst = datamodelOf([REPORTS, MANAGER_ID, MANAGER])
const listLast = datamodelOf([MANAGER_ID, MANAGER, REPORTS])

describe('a self one-to-many declared list first', () => {
  it.each([
    ['atlas', (dm: DMMF.Datamodel) => atlasSchema(dm, 'postgresql', {})],
    ['gorm', (dm: DMMF.Datamodel) => generateGormModels(dm.models, dm.enums, dm.indexes)],
    ['kysely', (dm: DMMF.Datamodel) => kyselySchema(dm)],
    ['sea-orm', (dm: DMMF.Datamodel) => seaOrmFiles(dm.models, dm.enums)],
    ['sqlalchemy', (dm: DMMF.Datamodel) => generateSingleFile(dm.models, dm.enums)],
    ['activerecord', (dm: DMMF.Datamodel) => activeRecordModelFiles(dm.models, dm.enums)],
  ])('%s writes what it writes with the list declared last', (_, render) => {
    expect(render(listFirst)).toStrictEqual(render(listLast))
  })

  // drizzle lists a model's relations in declaration order, so only the join table is compared.
  it('drizzle relates the list to the model, not to a join table', () => {
    const code = drizzleSchema(listFirst, 'postgresql', listFirst.indexes)
    expect(code).not.toContain("'_Mgr'")
    expect(code).toContain("reports: many(employee, { relationName: 'Mgr' })")
  })
})

// A self many-to-many: `_Follow` holds a row's own key in `A` for the field whose name sorts first
// (`aFollowing`) and in `B` for the other, so the two ends read the table in opposite directions.
// `zFollowers` is declared first to keep declaration order from deciding it.
describe('a self many-to-many', () => {
  const follow = datamodelOf([
    'zFollowers Employee[] @relation("Follow")',
    'aFollowing Employee[] @relation("Follow")',
  ])

  it('gorm joins each end on its own column', () => {
    const code = generateGormModels(follow.models, follow.enums, follow.indexes)
    expect(code).toContain(
      'AFollowing []Employee `gorm:"many2many:_Follow;joinForeignKey:A;joinReferences:B"`',
    )
    expect(code).toContain(
      'ZFollowers []Employee `gorm:"many2many:_Follow;joinForeignKey:B;joinReferences:A"`',
    )
  })

  it('activerecord joins each end on its own column', () => {
    const [{ code }] = activeRecordModelFiles(follow.models, follow.enums)
    expect(code).toContain(
      'has_and_belongs_to_many :a_following, class_name: "Employee", join_table: "_Follow", foreign_key: "A",',
    )
    expect(code).toContain(
      'has_and_belongs_to_many :z_followers, class_name: "Employee", join_table: "_Follow", foreign_key: "B",',
    )
  })
})
