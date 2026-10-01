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

  // Both columns point at Employee, so drizzle pairs each `many()` with its `one()` by name.
  it('drizzle names the column each end reads', () => {
    const code = drizzleSchema(follow, 'postgresql', follow.indexes)
    expect(code).toContain(
      "export const employeeRelations = relations(employee, ({ many }) => ({ zFollowers: many(follow, { relationName: 'Follow_B' }), aFollowing: many(follow, { relationName: 'Follow_A' }) }))",
    )
    expect(code).toContain(
      "export const followRelations = relations(follow, ({ one }) => ({ employee: one(employee, { fields: [follow.A], references: [employee.id], relationName: 'Follow_A' }), employee_: one(employee, { fields: [follow.B], references: [employee.id], relationName: 'Follow_B' }) }))",
    )
  })

  // `Related<Entity>` could name only one end, and the join table's two keys would both be
  // `employee_id`: the keys take their columns' names, and each end is a `Linked`.
  it('sea-orm links each end through its own column', () => {
    const files = seaOrmFiles(follow.models, follow.enums)
    expect(files.find((f) => f.fileName === 'employee.rs')?.code).toBe(
      'use sea_orm::entity::prelude::*;\nuse serde::{Deserialize, Serialize};\n\n#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]\n#[sea_orm(table_name = "Employee")]\npub struct Model {\n    #[sea_orm(primary_key)]\n    pub id: i32,\n}\n\n#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]\npub enum Relation {}\n\npub struct ZFollowersLink;\n\nimpl Linked for ZFollowersLink {\n    type FromEntity = Entity;\n    type ToEntity = Entity;\n\n    fn link(&self) -> Vec<RelationDef> {\n        vec![\n            super::follow::Relation::B.def().rev(),\n            super::follow::Relation::A.def(),\n        ]\n    }\n}\n\npub struct AFollowingLink;\n\nimpl Linked for AFollowingLink {\n    type FromEntity = Entity;\n    type ToEntity = Entity;\n\n    fn link(&self) -> Vec<RelationDef> {\n        vec![\n            super::follow::Relation::A.def().rev(),\n            super::follow::Relation::B.def(),\n        ]\n    }\n}\n\nimpl ActiveModelBehavior for ActiveModel {}\n',
    )
    expect(files.find((f) => f.fileName === 'follow.rs')?.code).toBe(
      'use sea_orm::entity::prelude::*;\nuse serde::{Deserialize, Serialize};\n\n#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]\n#[sea_orm(table_name = "_Follow")]\npub struct Model {\n    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]\n    pub a: i32,\n    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]\n    pub b: i32,\n}\n\n#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]\npub enum Relation {\n    #[sea_orm(\n        belongs_to = "super::employee::Entity",\n        from = "Column::A",\n        to = "super::employee::Column::Id"\n    )]\n    A,\n    #[sea_orm(\n        belongs_to = "super::employee::Entity",\n        from = "Column::B",\n        to = "super::employee::Column::Id"\n    )]\n    B,\n}\n\nimpl ActiveModelBehavior for ActiveModel {}\n',
    )
  })
})

// sea-orm names an entity's key column after the field, so the join table refers to `PostId`
// and `Slug`, not to an `Id` neither entity has.
describe('a many-to-many between keys not named id', () => {
  it('sea-orm refers to each key column by its name', () => {
    const result = getDMMF({
      datamodel: [
        [
          'schema.prisma',
          'datasource db {\n  provider = "postgresql"\n}\nmodel Post {\n  postId Int @id\n  tags Tag[]\n}\nmodel Tag {\n  slug String @id\n  posts Post[]\n}\n',
        ],
      ],
    })
    if ('type' in result) throw new Error(result.error.message)
    const code = seaOrmFiles(result.datamodel.models, result.datamodel.enums).find(
      (f) => f.fileName === 'post_to_tag.rs',
    )?.code
    expect(code).toContain('to = "super::post::Column::PostId"')
    expect(code).toContain('to = "super::tag::Column::Slug"')
  })
})
