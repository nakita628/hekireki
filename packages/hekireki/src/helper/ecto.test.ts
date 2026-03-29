import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { ectoSchemas, ectoTypeToTypespec, prismaTypeToEctoType } from './ecto.js'

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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          active: boolean()\n        }\n\n  schema "user" do\n    field(:active, :boolean, default: true)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Mission do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          priority: integer()\n        }\n\n  schema "mission" do\n    field(:priority, :integer, default: 1)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Config do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          locale: String.t()\n        }\n\n  schema "config" do\n    field(:locale, :string, default: "en")\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Event do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          occurred_at: DateTime.t()\n        }\n\n  schema "event" do\n    field(:occurred_at, :utc_datetime, source: :occurredAt)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.MissionAssignment do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: String.t()\n        }\n\n  schema "mission_assignment" do\n    field(:role, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "agent" do\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "user" do\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          id: String.t()\n        }\n\n  schema "user" do\n    field(:id, :string, primary_key: true)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          text: String.t(),\n          count: integer(),\n          flag: boolean(),\n          at: DateTime.t()\n        }\n\n  schema "type_test" do\n    field(:text, :string)\n    field(:count, :integer)\n    field(:flag, :boolean)\n    field(:at, :utc_datetime)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          text: String.t(),\n          count: integer(),\n          flag: boolean(),\n          at: DateTime.t()\n        }\n\n  schema "type_test" do\n    field(:text, :string)\n    field(:count, :integer)\n    field(:flag, :boolean)\n    field(:at, :utc_datetime)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          code_name: String.t(),\n          is_active: boolean()\n        }\n\n  schema "agent" do\n    field(:code_name, :string, source: :codeName)\n    field(:is_active, :boolean, source: :isActive)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          is_active: boolean()\n        }\n\n  schema "agent" do\n    field(:name, :string)\n    field(:is_active, :boolean)\n  end\nend',
      )
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

      expect(profileResult).toBe(
        'defmodule App.Profile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          bio: String.t(),\n          agent: App.Agent.t() | nil\n        }\n\n  schema "profile" do\n    field(:bio, :string)\n    field(:agent_id, :binary_id, source: :agentId)\n    belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)\n  end\nend',
      )
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

      expect(agentResult).toBe(
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          profile: App.Profile.t() | nil\n        }\n\n  schema "agent" do\n    has_one(:profile, App.Profile, foreign_key: :agent_id)\n  end\nend',
      )
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

      expect(agentResult).toBe(
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          reports: [App.Report.t()]\n        }\n\n  schema "agent" do\n    has_many(:reports, App.Report, foreign_key: :agent_id)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.MissionAssignment do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: String.t(),\n          agent: App.Agent.t() | nil,\n          mission: App.Mission.t() | nil\n        }\n\n  schema "mission_assignment" do\n    field(:role, :string)\n    field(:agent_id, :binary_id, source: :agentId)\n    field(:mission_id, :binary_id, source: :missionId)\n    belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)\n    belongs_to(:mission, App.Mission, foreign_key: :mission_id, define_field: false)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          id: String.t(),\n          name: String.t()\n        }\n\n  schema "user" do\n    field(:id, :string, primary_key: true)\n    field(:name, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :id, autogenerate: true}\n\n  @type t :: %__MODULE__{\n          id: integer(),\n          title: String.t()\n        }\n\n  schema "post" do\n    field(:title, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          score: float(),\n          big_num: integer(),\n          price: Decimal.t(),\n          metadata: map(),\n          data: binary()\n        }\n\n  schema "type_test" do\n    field(:score, :float)\n    field(:big_num, :integer, source: :bigNum)\n    field(:price, :decimal)\n    field(:metadata, :map)\n    field(:data, :binary)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          score: float(),\n          big_num: integer(),\n          price: Decimal.t(),\n          metadata: map(),\n          data: binary()\n        }\n\n  schema "type_test" do\n    field(:score, :float)\n    field(:big_num, :integer, source: :bigNum)\n    field(:price, :decimal)\n    field(:metadata, :map)\n    field(:data, :binary)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          role: atom()\n        }\n\n  schema "user" do\n    field(:name, :string)\n    field(:role, Ecto.Enum, values: [:ADMIN, :USER])\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: atom() | nil\n        }\n\n  schema "user" do\n    field(:role, Ecto.Enum, values: [:ADMIN, :USER])\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          bio: String.t() | nil,\n          age: integer() | nil\n        }\n\n  schema "user" do\n    field(:name, :string)\n    field(:bio, :string)\n    field(:age, :integer)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :id, autogenerate: true}\n\n  @type t :: %__MODULE__{\n          id: integer(),\n          title: String.t(),\n          user: App.User.t() | nil\n        }\n\n  schema "post" do\n    field(:title, :string)\n    field(:user_id, :id, source: :userId)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Like do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          user_id: Ecto.UUID.t(),\n          post_id: Ecto.UUID.t(),\n          user: App.User.t() | nil,\n          post: App.Post.t() | nil\n        }\n\n  schema "like" do\n    field(:user_id, :binary_id, primary_key: true, source: :userId)\n    field(:post_id, :binary_id, primary_key: true, source: :postId)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)\n    belongs_to(:post, App.Post, foreign_key: :post_id, define_field: false, type: :binary_id)\n    timestamps(type: :utc_datetime, inserted_at_source: :createdAt)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Like do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          user_id: Ecto.UUID.t(),\n          post_id: Ecto.UUID.t(),\n          user: App.User.t() | nil,\n          post: App.Post.t() | nil\n        }\n\n  schema "like" do\n    field(:user_id, :binary_id, primary_key: true)\n    field(:post_id, :binary_id, primary_key: true)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)\n    belongs_to(:post, App.Post, foreign_key: :post_id, define_field: false, type: :binary_id)\n  end\nend',
      )
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

      expect(userResult).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          followers: [App.Follow.t()],\n          following: [App.Follow.t()]\n        }\n\n  schema "user" do\n    has_many(:followers, App.Follow, foreign_key: :following_id)\n    has_many(:following, App.Follow, foreign_key: :follower_id)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.UserProfile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          bio: String.t()\n        }\n\n  schema "user_profiles" do\n    field(:bio, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.UserProfile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          bio: String.t()\n        }\n\n  schema "user_profile" do\n    field(:bio, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          first_name: String.t()\n        }\n\n  schema "user" do\n    field(:first_name, :string)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          first_name: String.t()\n        }\n\n  schema "user" do\n    field(:first_name, :string, source: :fname)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          display_name: String.t()\n        }\n\n  schema "user" do\n    field(:display_name, :string, source: :display_nm)\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          tags: [String.t()],\n          scores: [integer()]\n        }\n\n  schema "post" do\n    field(:tags, {:array, :string})\n    field(:scores, {:array, :integer})\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          tags: [String.t()],\n          scores: [integer()]\n        }\n\n  schema "post" do\n    field(:tags, {:array, :string})\n    field(:scores, {:array, :integer})\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "user" do\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc """\n  User account schema\n  """\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "user" do\n  end\nend',
      )
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

      expect(result).toBe(
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc """\n  User account schema\n  Used for authentication\n  """\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "user" do\n  end\nend',
      )
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

  describe('prismaTypeToEctoType', () => {
    it('converts Int to integer', () => {
      expect(prismaTypeToEctoType('Int')).toBe('integer')
    })
    it('converts String to string', () => {
      expect(prismaTypeToEctoType('String')).toBe('string')
    })
    it('converts Boolean to boolean', () => {
      expect(prismaTypeToEctoType('Boolean')).toBe('boolean')
    })
    it('converts DateTime to utc_datetime', () => {
      expect(prismaTypeToEctoType('DateTime')).toBe('utc_datetime')
    })
    it('maps Float to float', () => {
      expect(prismaTypeToEctoType('Float')).toBe('float')
    })
    it('maps BigInt to integer', () => {
      expect(prismaTypeToEctoType('BigInt')).toBe('integer')
    })
    it('maps Decimal to decimal', () => {
      expect(prismaTypeToEctoType('Decimal')).toBe('decimal')
    })
    it('maps Json to map', () => {
      expect(prismaTypeToEctoType('Json')).toBe('map')
    })
    it('maps Bytes to binary', () => {
      expect(prismaTypeToEctoType('Bytes')).toBe('binary')
    })
    it('returns string for unsupported types', () => {
      expect(prismaTypeToEctoType('Unknown')).toBe('string')
    })
  })

  describe('ectoTypeToTypespec', () => {
    it('converts string to String.t()', () => {
      expect(ectoTypeToTypespec('string')).toBe('String.t()')
    })
    it('converts integer to integer()', () => {
      expect(ectoTypeToTypespec('integer')).toBe('integer()')
    })
    it('converts binary_id to Ecto.UUID.t()', () => {
      expect(ectoTypeToTypespec('binary_id')).toBe('Ecto.UUID.t()')
    })
    it('converts utc_datetime to DateTime.t()', () => {
      expect(ectoTypeToTypespec('utc_datetime')).toBe('DateTime.t()')
    })
    it('returns term() for unknown types', () => {
      expect(ectoTypeToTypespec('unknown_type')).toBe('term()')
    })
  })
})
