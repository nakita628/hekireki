import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { ectoSchemas } from './ecto.js'

// Test run
// pnpm vitest run ./src/helper/ecto.test.ts

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

describe('ectoSchemas', () => {
  describe('timestamps', () => {
    it('generates timestamps with createdAt/updatedAt using source options', () => {
      const model = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'name', type: 'String' }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
          makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe(`defmodule App.Agent do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t()
        }

  schema "agent" do
    field(:name, :string)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end`)
    })

    it('generates timestamps with type for inserted_at/updated_at', () => {
      const model = makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'title', type: 'String' }),
          makeField({ name: 'inserted_at', type: 'DateTime' }),
          makeField({ name: 'updated_at', type: 'DateTime', isUpdatedAt: true }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe(`defmodule App.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t()
        }

  schema "post" do
    field(:title, :string)
    timestamps(type: :utc_datetime)
  end
end`)
    })

    it('generates no timestamps line when no timestamp fields', () => {
      const model = makeModel({
        name: 'Tag',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'label', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe(`defmodule App.Tag do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          label: String.t()
        }

  schema "tag" do
    field(:label, :string)
  end
end`)
    })
  })

  describe('default values', () => {
    it('generates boolean default', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'active',
            type: 'Boolean',
            hasDefaultValue: true,
            default: true,
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:active, :boolean, default: true)')
    })

    it('generates integer default', () => {
      const model = makeModel({
        name: 'Mission',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'priority',
            type: 'Int',
            hasDefaultValue: true,
            default: 1,
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:priority, :integer, default: 1)')
    })

    it('generates string default', () => {
      const model = makeModel({
        name: 'Config',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'locale',
            type: 'String',
            hasDefaultValue: true,
            default: 'en',
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:locale, :string, default: "en")')
    })

    it('ignores function defaults like now()', () => {
      const model = makeModel({
        name: 'Event',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'occurredAt',
            type: 'DateTime',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:occurred_at, :utc_datetime, source: :occurredAt)')
      expect(result).not.toContain('default:')
    })
  })

  describe('table naming', () => {
    it('converts PascalCase model to snake_case table', () => {
      const model = makeModel({
        name: 'MissionAssignment',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'role', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('schema "mission_assignment" do')
      expect(result).toContain('defmodule App.MissionAssignment do')
    })

    it('converts simple name to lowercase table', () => {
      const model = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('schema "agent" do')
    })
  })

  describe('primary key', () => {
    it('generates binary_id PK with @foreign_key_type for uuid default', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('@primary_key {:id, :binary_id, autogenerate: true}')
      expect(result).toContain('@foreign_key_type :binary_id')
      expect(result).toContain('id: Ecto.UUID.t()')
    })

    it('generates @primary_key false without @foreign_key_type for non-uuid String PK', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('@primary_key false')
      expect(result).toContain('field(:id, :binary_id, primary_key: true)')
      expect(result).not.toContain('@foreign_key_type')
    })
  })

  describe('type mapping', () => {
    it('maps all Prisma types correctly', () => {
      const model = makeModel({
        name: 'TypeTest',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'text', type: 'String' }),
          makeField({ name: 'count', type: 'Int' }),
          makeField({ name: 'flag', type: 'Boolean' }),
          makeField({ name: 'at', type: 'DateTime' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:text, :string)')
      expect(result).toContain('field(:count, :integer)')
      expect(result).toContain('field(:flag, :boolean)')
      expect(result).toContain('field(:at, :utc_datetime)')
    })

    it('generates correct typespecs', () => {
      const model = makeModel({
        name: 'TypeTest',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'text', type: 'String' }),
          makeField({ name: 'count', type: 'Int' }),
          makeField({ name: 'flag', type: 'Boolean' }),
          makeField({ name: 'at', type: 'DateTime' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('text: String.t()')
      expect(result).toContain('count: integer()')
      expect(result).toContain('flag: boolean()')
      expect(result).toContain('at: DateTime.t()')
    })
  })

  describe('snake_case field names', () => {
    it('converts camelCase field names to snake_case with source', () => {
      const model = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'codeName', type: 'String' }),
          makeField({ name: 'isActive', type: 'Boolean' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:code_name, :string, source: :codeName)')
      expect(result).toContain('field(:is_active, :boolean, source: :isActive)')
      expect(result).toContain('code_name: String.t()')
      expect(result).toContain('is_active: boolean()')
    })

    it('keeps already snake_case field names without source', () => {
      const model = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'is_active', type: 'Boolean' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:name, :string)')
      expect(result).toContain('field(:is_active, :boolean)')
      expect(result).not.toContain('source:')
    })
  })

  describe('associations', () => {
    it('generates belongs_to with snake_case FK and define_field: false', () => {
      const agentModel = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'name', type: 'String' }),
          makeField({
            name: 'profile',
            type: 'Profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'AgentToProfile',
          }),
        ],
      })

      const profileModel = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'bio', type: 'String' }),
          makeField({ name: 'agentId', type: 'String', isUnique: true }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToProfile',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [agentModel, profileModel]
      const profileResult = ectoSchemas([profileModel], 'App', allModels)

      expect(profileResult).toContain(
        'field(:agent_id, :binary_id, source: :agentId)',
      )
      expect(profileResult).toContain(
        'belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)',
      )
      expect(profileResult).not.toContain('field(:agentId')
    })

    it('generates has_one association with snake_case FK', () => {
      const agentModel = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'profile',
            type: 'Profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'AgentToProfile',
          }),
        ],
      })

      const profileModel = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'agentId', type: 'String', isUnique: true }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToProfile',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [agentModel, profileModel]
      const agentResult = ectoSchemas([agentModel], 'App', allModels)

      expect(agentResult).toContain(
        'has_one(:profile, App.Profile, foreign_key: :agent_id)',
      )
      expect(agentResult).toContain('profile: App.Profile.t() | nil')
    })

    it('generates has_many association with snake_case FK', () => {
      const agentModel = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'reports',
            type: 'Report',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'AgentToReport',
          }),
        ],
      })

      const reportModel = makeModel({
        name: 'Report',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'agentId', type: 'String' }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToReport',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [agentModel, reportModel]
      const agentResult = ectoSchemas([agentModel], 'App', allModels)

      expect(agentResult).toContain(
        'has_many(:reports, App.Report, foreign_key: :agent_id)',
      )
      expect(agentResult).toContain('reports: [App.Report.t()]')
    })

    it('generates join model with two belongs_to using snake_case FKs', () => {
      const agentModel = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'assignments',
            type: 'MissionAssignment',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'AgentToMissionAssignment',
          }),
        ],
      })

      const missionModel = makeModel({
        name: 'Mission',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'assignments',
            type: 'MissionAssignment',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'MissionToMissionAssignment',
          }),
        ],
      })

      const assignmentModel = makeModel({
        name: 'MissionAssignment',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'role', type: 'String' }),
          makeField({ name: 'agentId', type: 'String' }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToMissionAssignment',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
          makeField({ name: 'missionId', type: 'String' }),
          makeField({
            name: 'mission',
            type: 'Mission',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'MissionToMissionAssignment',
            relationFromFields: ['missionId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [agentModel, missionModel, assignmentModel]
      const result = ectoSchemas([assignmentModel], 'App', allModels)

      expect(result).toContain('schema "mission_assignment" do')
      expect(result).toContain('field(:role, :string)')
      expect(result).toContain('field(:agent_id, :binary_id, source: :agentId)')
      expect(result).toContain('field(:mission_id, :binary_id, source: :missionId)')
      expect(result).toContain(
        'belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)',
      )
      expect(result).toContain(
        'belongs_to(:mission, App.Mission, foreign_key: :mission_id, define_field: false)',
      )
      expect(result).not.toContain('field(:agentId')
      expect(result).not.toContain('field(:missionId')
    })
  })

  describe('multiple relations on one model', () => {
    it('generates has_one + has_many on same model with snake_case', () => {
      const agentModel = makeModel({
        name: 'Agent',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'codeName', type: 'String' }),
          makeField({
            name: 'active',
            type: 'Boolean',
            hasDefaultValue: true,
            default: true,
          }),
          makeField({
            name: 'profile',
            type: 'Profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'AgentToProfile',
          }),
          makeField({
            name: 'reports',
            type: 'Report',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'AgentToReport',
          }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
          makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
        ],
      })

      const profileModel = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'agentId', type: 'String', isUnique: true }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToProfile',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const reportModel = makeModel({
        name: 'Report',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'agentId', type: 'String' }),
          makeField({
            name: 'agent',
            type: 'Agent',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'AgentToReport',
            relationFromFields: ['agentId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [agentModel, profileModel, reportModel]
      const result = ectoSchemas([agentModel], 'App', allModels)

      expect(result).toBe(`defmodule App.Agent do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          code_name: String.t(),
          active: boolean(),
          profile: App.Profile.t() | nil,
          reports: [App.Report.t()]
        }

  schema "agent" do
    field(:code_name, :string, source: :codeName)
    field(:active, :boolean, default: true)
    has_one(:profile, App.Profile, foreign_key: :agent_id)
    has_many(:reports, App.Report, foreign_key: :agent_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end`)
    })
  })

  describe('empty model', () => {
    it('skips models without id field', () => {
      const model = makeModel({
        name: 'NoId',
        fields: [makeField({ name: 'name', type: 'String' })],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe('')
    })
  })
})
