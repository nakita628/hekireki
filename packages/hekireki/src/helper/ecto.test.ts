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
  @moduledoc false

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
  @moduledoc false

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
  @moduledoc false

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
      expect(result).toContain('field(:id, :string, primary_key: true)')
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

      expect(profileResult).toContain('field(:agent_id, :binary_id, source: :agentId)')
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

      expect(agentResult).toContain('has_one(:profile, App.Profile, foreign_key: :agent_id)')
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

      expect(agentResult).toContain('has_many(:reports, App.Report, foreign_key: :agent_id)')
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
  @moduledoc false

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

  describe('cuid primary key', () => {
    it('generates @primary_key false with field(:id, :string, primary_key: true) for cuid', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'cuid', args: [] },
          }),
          makeField({ name: 'name', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('@primary_key false')
      expect(result).toContain('field(:id, :string, primary_key: true)')
      expect(result).toContain('id: String.t()')
      expect(result).not.toContain('@foreign_key_type')
    })
  })

  describe('autoincrement primary key', () => {
    it('generates :id PK with autogenerate for autoincrement', () => {
      const model = makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'title', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('@primary_key {:id, :id, autogenerate: true}')
      expect(result).toContain('id: integer()')
      expect(result).not.toContain('@foreign_key_type')
      expect(result).not.toContain('field(:id,')
    })
  })

  describe('extended type mapping', () => {
    it('maps Float, BigInt, Decimal, Json, Bytes correctly', () => {
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
          makeField({ name: 'score', type: 'Float' }),
          makeField({ name: 'bigNum', type: 'BigInt' }),
          makeField({ name: 'price', type: 'Decimal' }),
          makeField({ name: 'metadata', type: 'Json' }),
          makeField({ name: 'data', type: 'Bytes' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:score, :float)')
      expect(result).toContain('field(:big_num, :integer, source: :bigNum)')
      expect(result).toContain('field(:price, :decimal)')
      expect(result).toContain('field(:metadata, :map)')
      expect(result).toContain('field(:data, :binary)')
    })

    it('generates correct typespecs for extended types', () => {
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
          makeField({ name: 'score', type: 'Float' }),
          makeField({ name: 'bigNum', type: 'BigInt' }),
          makeField({ name: 'price', type: 'Decimal' }),
          makeField({ name: 'metadata', type: 'Json' }),
          makeField({ name: 'data', type: 'Bytes' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('score: float()')
      expect(result).toContain('big_num: integer()')
      expect(result).toContain('price: Decimal.t()')
      expect(result).toContain('metadata: map()')
      expect(result).toContain('data: binary()')
    })
  })

  describe('enum support', () => {
    it('generates Ecto.Enum field with values', () => {
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
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'role', type: 'Role', kind: 'enum' }),
        ],
      })

      const enums = [
        {
          name: 'Role',
          values: [
            { name: 'ADMIN', dbName: null },
            { name: 'USER', dbName: null },
          ],
        },
      ] as const

      const result = ectoSchemas([model], 'App', undefined, enums)

      expect(result).toContain('field(:role, Ecto.Enum, values: [:ADMIN, :USER])')
      expect(result).toContain('role: atom()')
    })

    it('generates nullable enum typespec', () => {
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
          makeField({ name: 'role', type: 'Role', kind: 'enum', isRequired: false }),
        ],
      })

      const enums = [
        {
          name: 'Role',
          values: [
            { name: 'ADMIN', dbName: null },
            { name: 'USER', dbName: null },
          ],
        },
      ] as const

      const result = ectoSchemas([model], 'App', undefined, enums)

      expect(result).toContain('role: atom() | nil')
      expect(result).toContain('field(:role, Ecto.Enum, values: [:ADMIN, :USER])')
    })
  })

  describe('nullable field typespecs', () => {
    it('appends | nil for non-required fields', () => {
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
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'bio', type: 'String', isRequired: false }),
          makeField({ name: 'age', type: 'Int', isRequired: false }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('name: String.t(),')
      expect(result).toContain('bio: String.t() | nil,')
      expect(result).toContain('age: integer() | nil')
      expect(result).not.toContain('name: String.t() | nil')
    })
  })

  describe('belongs_to with autoincrement PK target', () => {
    it('does not emit FK type for integer PK target', () => {
      const userModel = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'UserToPost',
          }),
        ],
      })

      const postModel = makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'title', type: 'String' }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'UserToPost',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [userModel, postModel]
      const result = ectoSchemas([postModel], 'App', allModels)

      expect(result).toContain(
        'belongs_to(:user, App.User, foreign_key: :user_id, define_field: false)',
      )
      expect(result).not.toContain('type: :binary_id')
    })
  })

  describe('composite primary key', () => {
    it('generates schema with composite PK using @@id', () => {
      const userModel = makeModel({
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
            name: 'followers',
            type: 'Follow',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'Follower',
          }),
          makeField({
            name: 'following',
            type: 'Follow',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'Following',
          }),
        ],
      })

      const followModel = makeModel({
        name: 'Follow',
        primaryKey: { name: null, fields: ['followerId', 'followingId'] },
        fields: [
          makeField({ name: 'followerId', type: 'String' }),
          makeField({ name: 'followingId', type: 'String' }),
          makeField({
            name: 'follower',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'Following',
            relationFromFields: ['followerId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'following',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'Follower',
            relationFromFields: ['followingId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [userModel, followModel]
      const result = ectoSchemas([followModel], 'App', allModels)

      expect(result).toBe(`defmodule App.Follow do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          follower_id: Ecto.UUID.t(),
          following_id: Ecto.UUID.t(),
          follower: App.User.t() | nil,
          following: App.User.t() | nil
        }

  schema "follow" do
    field(:follower_id, :binary_id, primary_key: true, source: :followerId)
    field(:following_id, :binary_id, primary_key: true, source: :followingId)
    belongs_to(:follower, App.User, foreign_key: :follower_id, define_field: false, type: :binary_id)
    belongs_to(:following, App.User, foreign_key: :following_id, define_field: false, type: :binary_id)
  end
end`)
    })

    it('generates composite PK with timestamps', () => {
      const userModel = makeModel({
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
            name: 'likes',
            type: 'Like',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'UserToLike',
          }),
        ],
      })

      const postModel = makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'likes',
            type: 'Like',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'PostToLike',
          }),
        ],
      })

      const likeModel = makeModel({
        name: 'Like',
        primaryKey: { name: null, fields: ['userId', 'postId'] },
        fields: [
          makeField({ name: 'userId', type: 'String' }),
          makeField({ name: 'postId', type: 'String' }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'UserToLike',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'post',
            type: 'Post',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'PostToLike',
            relationFromFields: ['postId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [userModel, postModel, likeModel]
      const result = ectoSchemas([likeModel], 'App', allModels)

      expect(result).toContain('@primary_key false')
      expect(result).toContain('field(:user_id, :binary_id, primary_key: true, source: :userId)')
      expect(result).toContain('field(:post_id, :binary_id, primary_key: true, source: :postId)')
      expect(result).toContain(
        'belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)',
      )
      expect(result).toContain(
        'belongs_to(:post, App.Post, foreign_key: :post_id, define_field: false, type: :binary_id)',
      )
      expect(result).toContain('timestamps(type: :utc_datetime, inserted_at_source: :createdAt)')
      expect(result).toContain('user_id: Ecto.UUID.t()')
      expect(result).toContain('post_id: Ecto.UUID.t()')
    })

    it('generates composite PK without FK relations (plain fields)', () => {
      const model = makeModel({
        name: 'PostTag',
        primaryKey: { name: null, fields: ['postSlug', 'tagSlug'] },
        fields: [
          makeField({ name: 'postSlug', type: 'String' }),
          makeField({ name: 'tagSlug', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe(`defmodule App.PostTag do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          post_slug: String.t(),
          tag_slug: String.t()
        }

  schema "post_tag" do
    field(:post_slug, :string, primary_key: true, source: :postSlug)
    field(:tag_slug, :string, primary_key: true, source: :tagSlug)
  end
end`)
    })

    it('generates composite PK with snake_case FK fields', () => {
      const userModel = makeModel({
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

      const postModel = makeModel({
        name: 'Post',
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

      const likeModel = makeModel({
        name: 'Like',
        primaryKey: { name: null, fields: ['user_id', 'post_id'] },
        fields: [
          makeField({ name: 'user_id', type: 'String' }),
          makeField({ name: 'post_id', type: 'String' }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'UserToLike',
            relationFromFields: ['user_id'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'post',
            type: 'Post',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'PostToLike',
            relationFromFields: ['post_id'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [userModel, postModel, likeModel]
      const result = ectoSchemas([likeModel], 'App', allModels)

      expect(result).toContain('@primary_key false')
      expect(result).toContain('field(:user_id, :binary_id, primary_key: true)')
      expect(result).toContain('field(:post_id, :binary_id, primary_key: true)')
      expect(result).toContain(
        'belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)',
      )
      expect(result).not.toContain('source:')
    })

    it('generates has_many on parent model pointing to composite PK model', () => {
      const userModel = makeModel({
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
            name: 'followers',
            type: 'Follow',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'Follower',
          }),
          makeField({
            name: 'following',
            type: 'Follow',
            kind: 'object',
            isList: true,
            isRequired: false,
            relationName: 'Following',
          }),
        ],
      })

      const followModel = makeModel({
        name: 'Follow',
        primaryKey: { name: null, fields: ['followerId', 'followingId'] },
        fields: [
          makeField({ name: 'followerId', type: 'String' }),
          makeField({ name: 'followingId', type: 'String' }),
          makeField({
            name: 'follower',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'Following',
            relationFromFields: ['followerId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'following',
            type: 'User',
            kind: 'object',
            isList: false,
            isRequired: true,
            relationName: 'Follower',
            relationFromFields: ['followingId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const allModels = [userModel, followModel]
      const userResult = ectoSchemas([userModel], 'App', allModels)

      expect(userResult).toContain('has_many(:followers, App.Follow, foreign_key: :following_id)')
      expect(userResult).toContain('has_many(:following, App.Follow, foreign_key: :follower_id)')
      expect(userResult).toContain('followers: [App.Follow.t()]')
      expect(userResult).toContain('following: [App.Follow.t()]')
    })
  })

  describe('@@map table name', () => {
    it('uses dbName for schema table name when @@map is set', () => {
      const model = makeModel({
        name: 'UserProfile',
        dbName: 'user_profiles',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'bio', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('schema "user_profiles" do')
    })

    it('falls back to snake_case model name when dbName is null', () => {
      const model = makeModel({
        name: 'UserProfile',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({ name: 'bio', type: 'String' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('schema "user_profile" do')
    })
  })

  describe('@map field name', () => {
    it('uses dbName for field source option when @map is set', () => {
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
          makeField({ name: 'firstName', type: 'String', dbName: 'first_name' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      // snake_case of "firstName" is "first_name" which matches dbName, so no source needed
      expect(result).toContain('field(:first_name, :string)')
      expect(result).not.toContain('source:')
    })

    it('adds source option when dbName differs from snake_case name', () => {
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
          makeField({ name: 'firstName', type: 'String', dbName: 'fname' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:first_name, :string, source: :fname)')
    })

    it('uses dbName over field name for source when both differ from snake_case', () => {
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
          makeField({ name: 'displayName', type: 'String', dbName: 'display_nm' }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      // source should use dbName, not field name
      expect(result).toContain('source: :display_nm')
      expect(result).not.toContain('source: :displayName')
    })
  })

  describe('array fields', () => {
    it('generates {:array, :type} for list scalar fields', () => {
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
          makeField({ name: 'tags', type: 'String', isList: true }),
          makeField({ name: 'scores', type: 'Int', isList: true }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('field(:tags, {:array, :string})')
      expect(result).toContain('field(:scores, {:array, :integer})')
    })

    it('generates list typespec for array fields', () => {
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
          makeField({ name: 'tags', type: 'String', isList: true }),
          makeField({ name: 'scores', type: 'Int', isList: true }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('tags: [String.t()]')
      expect(result).toContain('scores: [integer()]')
    })
  })

  describe('@moduledoc false', () => {
    it('includes @moduledoc false when no documentation', () => {
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

      expect(result).toContain('  @moduledoc false')
      const lines = result.split('\n')
      const useIdx = lines.findIndex((l) => l.includes('use Ecto.Schema'))
      expect(lines[useIdx + 1]).toBe('  @moduledoc false')
    })

    it('uses model.documentation for @moduledoc when present', () => {
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
        documentation: 'User account schema',
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('  @moduledoc """')
      expect(result).toContain('  User account schema')
      expect(result).toContain('  """')
      expect(result).not.toContain('@moduledoc false')
    })

    it('handles multi-line documentation', () => {
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
        documentation: 'User account schema\nUsed for authentication',
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toContain('  @moduledoc """')
      expect(result).toContain('  User account schema')
      expect(result).toContain('  Used for authentication')
      expect(result).toContain('  """')
    })
  })

  describe('empty model', () => {
    it('skips models without id field and without composite PK', () => {
      const model = makeModel({
        name: 'NoId',
        fields: [makeField({ name: 'name', type: 'String' })],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe('')
    })
  })
})
