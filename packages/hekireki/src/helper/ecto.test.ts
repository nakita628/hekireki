import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { relationMaps } from '../utils/prisma-schema-text.js'
import { ectoProblems, ectoSchemas, ectoTypeToTypespec, prismaTypeToEctoType } from './ecto.js'

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

  schema "Agent" do
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

  schema "Post" do
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

  schema "Tag" do
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          active: boolean()\n        }\n\n  schema "User" do\n    field(:active, :boolean, default: true)\n  end\nend',
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
        'defmodule App.Mission do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          priority: integer()\n        }\n\n  schema "Mission" do\n    field(:priority, :integer, default: 1)\n  end\nend',
      )
    })

    it('generates float literal for integer-valued default on Float field', () => {
      const model = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [4] },
          }),
          makeField({
            name: 'score',
            type: 'Float',
            hasDefaultValue: true,
            default: 0,
          }),
          makeField({
            name: 'ratio',
            type: 'Float',
            hasDefaultValue: true,
            default: 0.5,
          }),
        ],
      })

      const result = ectoSchemas([model], 'App')

      expect(result).toBe(
        'defmodule App.Profile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          score: float(),\n          ratio: float()\n        }\n\n  schema "Profile" do\n    field(:score, :float, default: 0.0)\n    field(:ratio, :float, default: 0.5)\n  end\nend',
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
        'defmodule App.Config do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          locale: String.t()\n        }\n\n  schema "Config" do\n    field(:locale, :string, default: "en")\n  end\nend',
      )
    })

    it('reads back a now() default the database fills', () => {
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
        'defmodule App.Event do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          occurred_at: DateTime.t()\n        }\n\n  schema "Event" do\n    field(:occurred_at, :utc_datetime, read_after_writes: true, source: :occurredAt)\n  end\nend',
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
        'defmodule App.MissionAssignment do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: String.t()\n        }\n\n  schema "MissionAssignment" do\n    field(:role, :string)\n  end\nend',
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
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "Agent" do\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "User" do\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          id: String.t()\n        }\n\n  schema "User" do\n    field(:id, :string, primary_key: true)\n  end\nend',
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
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          text: String.t(),\n          count: integer(),\n          flag: boolean(),\n          at: DateTime.t()\n        }\n\n  schema "TypeTest" do\n    field(:text, :string)\n    field(:count, :integer)\n    field(:flag, :boolean)\n    field(:at, :utc_datetime)\n  end\nend',
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
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          text: String.t(),\n          count: integer(),\n          flag: boolean(),\n          at: DateTime.t()\n        }\n\n  schema "TypeTest" do\n    field(:text, :string)\n    field(:count, :integer)\n    field(:flag, :boolean)\n    field(:at, :utc_datetime)\n  end\nend',
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
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          code_name: String.t(),\n          is_active: boolean()\n        }\n\n  schema "Agent" do\n    field(:code_name, :string, source: :codeName)\n    field(:is_active, :boolean, source: :isActive)\n  end\nend',
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
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          is_active: boolean()\n        }\n\n  schema "Agent" do\n    field(:name, :string)\n    field(:is_active, :boolean)\n  end\nend',
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
        'defmodule App.Profile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          bio: String.t(),\n          agent: App.Agent.t() | nil\n        }\n\n  schema "Profile" do\n    field(:bio, :string)\n    field(:agent_id, :binary_id, source: :agentId)\n    belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)\n  end\nend',
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
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          profile: App.Profile.t() | nil\n        }\n\n  schema "Agent" do\n    has_one(:profile, App.Profile, foreign_key: :agent_id)\n  end\nend',
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
        'defmodule App.Agent do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          reports: [App.Report.t()]\n        }\n\n  schema "Agent" do\n    has_many(:reports, App.Report, foreign_key: :agent_id)\n  end\nend',
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
        'defmodule App.MissionAssignment do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: String.t(),\n          agent: App.Agent.t() | nil,\n          mission: App.Mission.t() | nil\n        }\n\n  schema "MissionAssignment" do\n    field(:role, :string)\n    field(:agent_id, :binary_id, source: :agentId)\n    field(:mission_id, :binary_id, source: :missionId)\n    belongs_to(:agent, App.Agent, foreign_key: :agent_id, define_field: false)\n    belongs_to(:mission, App.Mission, foreign_key: :mission_id, define_field: false)\n  end\nend',
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

  schema "Agent" do
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          id: String.t(),\n          name: String.t()\n        }\n\n  schema "User" do\n    field(:id, :string, primary_key: true)\n    field(:name, :string)\n  end\nend',
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
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :id, autogenerate: true}\n\n  @type t :: %__MODULE__{\n          id: integer(),\n          title: String.t()\n        }\n\n  schema "Post" do\n    field(:title, :string)\n  end\nend',
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
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          score: float(),\n          big_num: integer(),\n          price: Decimal.t(),\n          metadata: map(),\n          data: binary()\n        }\n\n  schema "TypeTest" do\n    field(:score, :float)\n    field(:big_num, :integer, source: :bigNum)\n    field(:price, :decimal)\n    field(:metadata, :map)\n    field(:data, :binary)\n  end\nend',
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
        'defmodule App.TypeTest do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          score: float(),\n          big_num: integer(),\n          price: Decimal.t(),\n          metadata: map(),\n          data: binary()\n        }\n\n  schema "TypeTest" do\n    field(:score, :float)\n    field(:big_num, :integer, source: :bigNum)\n    field(:price, :decimal)\n    field(:metadata, :map)\n    field(:data, :binary)\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          role: atom()\n        }\n\n  schema "User" do\n    field(:name, :string)\n    field(:role, Ecto.Enum, values: [:ADMIN, :USER])\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          role: atom() | nil\n        }\n\n  schema "User" do\n    field(:role, Ecto.Enum, values: [:ADMIN, :USER])\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          name: String.t(),\n          bio: String.t() | nil,\n          age: integer() | nil\n        }\n\n  schema "User" do\n    field(:name, :string)\n    field(:bio, :string)\n    field(:age, :integer)\n  end\nend',
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
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :id, autogenerate: true}\n\n  @type t :: %__MODULE__{\n          id: integer(),\n          title: String.t(),\n          user: App.User.t() | nil\n        }\n\n  schema "Post" do\n    field(:title, :string)\n    field(:user_id, :id, source: :userId)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false)\n  end\nend',
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

  schema "Follow" do
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
        'defmodule App.Like do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          user_id: Ecto.UUID.t(),\n          post_id: Ecto.UUID.t(),\n          user: App.User.t() | nil,\n          post: App.Post.t() | nil\n        }\n\n  schema "Like" do\n    field(:user_id, :binary_id, primary_key: true, source: :userId)\n    field(:post_id, :binary_id, primary_key: true, source: :postId)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)\n    belongs_to(:post, App.Post, foreign_key: :post_id, define_field: false, type: :binary_id)\n    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at: false)\n  end\nend',
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

  schema "PostTag" do
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
        'defmodule App.Like do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key false\n\n  @type t :: %__MODULE__{\n          user_id: Ecto.UUID.t(),\n          post_id: Ecto.UUID.t(),\n          user: App.User.t() | nil,\n          post: App.Post.t() | nil\n        }\n\n  schema "Like" do\n    field(:user_id, :binary_id, primary_key: true)\n    field(:post_id, :binary_id, primary_key: true)\n    belongs_to(:user, App.User, foreign_key: :user_id, define_field: false, type: :binary_id)\n    belongs_to(:post, App.Post, foreign_key: :post_id, define_field: false, type: :binary_id)\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          followers: [App.Follow.t()],\n          following: [App.Follow.t()]\n        }\n\n  schema "User" do\n    has_many(:followers, App.Follow, foreign_key: :following_id)\n    has_many(:following, App.Follow, foreign_key: :follower_id)\n  end\nend',
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
        'defmodule App.UserProfile do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          bio: String.t()\n        }\n\n  schema "UserProfile" do\n    field(:bio, :string)\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          first_name: String.t()\n        }\n\n  schema "User" do\n    field(:first_name, :string)\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          first_name: String.t()\n        }\n\n  schema "User" do\n    field(:first_name, :string, source: :fname)\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          display_name: String.t()\n        }\n\n  schema "User" do\n    field(:display_name, :string, source: :display_nm)\n  end\nend',
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
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          tags: [String.t()],\n          scores: [integer()]\n        }\n\n  schema "Post" do\n    field(:tags, {:array, :string})\n    field(:scores, {:array, :integer})\n  end\nend',
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
        'defmodule App.Post do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t(),\n          tags: [String.t()],\n          scores: [integer()]\n        }\n\n  schema "Post" do\n    field(:tags, {:array, :string})\n    field(:scores, {:array, :integer})\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc false\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "User" do\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc """\n  User account schema\n  """\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "User" do\n  end\nend',
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
        'defmodule App.User do\n  use Ecto.Schema\n  @moduledoc """\n  User account schema\n  Used for authentication\n  """\n\n  @primary_key {:id, :binary_id, autogenerate: true}\n  @foreign_key_type :binary_id\n\n  @type t :: %__MODULE__{\n          id: Ecto.UUID.t()\n        }\n\n  schema "User" do\n  end\nend',
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

describe('uuid v7 primary key', () => {
  it('generates Ecto.UUID with autogenerate version 7', () => {
    const model = makeModel({
      name: 'Event',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [7] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(ectoSchemas([model], 'App')).toBe(`defmodule App.Event do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, Ecto.UUID, autogenerate: [version: 7]}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t()
        }

  schema "Event" do
    field(:name, :string)
  end
end`)
  })
})

describe('ulid primary key', () => {
  it('generates Ecto.ULID with autogenerate and module foreign key types', () => {
    const ticket = makeModel({
      name: 'Ticket',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({ name: 'label', type: 'String' }),
        makeField({
          name: 'stubs',
          type: 'Stub',
          kind: 'object',
          isList: true,
          relationName: 'StubToTicket',
        }),
      ],
    })
    const stub = makeModel({
      name: 'Stub',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'ticketId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'ticket',
          type: 'Ticket',
          kind: 'object',
          relationName: 'StubToTicket',
          relationFromFields: ['ticketId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(ectoSchemas([ticket], 'App', [ticket, stub])).toBe(`defmodule App.Ticket do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, Ecto.ULID, autogenerate: true}
  @foreign_key_type Ecto.ULID

  @type t :: %__MODULE__{
          id: Ecto.ULID.t(),
          label: String.t(),
          stubs: [App.Stub.t()]
        }

  schema "Ticket" do
    field(:label, :string)
    has_many(:stubs, App.Stub, foreign_key: :ticket_id)
  end
end`)

    expect(ectoSchemas([stub], 'App', [ticket, stub])).toBe(`defmodule App.Stub do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          ticket: App.Ticket.t() | nil
        }

  schema "Stub" do
    field(:ticket_id, Ecto.ULID, source: :ticketId)
    belongs_to(:ticket, App.Ticket, foreign_key: :ticket_id, define_field: false, type: Ecto.ULID)
  end
end`)
  })
})

describe('@map-ped primary key', () => {
  it('maps the :id primary key to the actual column via :source', () => {
    const model = makeModel({
      name: 'Device',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          dbName: 'device_id',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(ectoSchemas([model], 'App')).toBe(`defmodule App.Device do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true, source: :device_id}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t()
        }

  schema "Device" do
    field(:name, :string)
  end
end`)
  })
})

describe('implicit many-to-many', () => {
  it('generates join_keys for the Prisma A/B join table columns on both sides', () => {
    const post = makeModel({
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
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })

    expect(ectoSchemas([post], 'App', [post, tag])).toBe(`defmodule App.Post do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          tags: [App.Tag.t()]
        }

  schema "Post" do
    many_to_many(:tags, App.Tag, join_through: "_PostTags", join_keys: [A: :id, B: :id])
  end
end`)

    expect(ectoSchemas([tag], 'App', [post, tag])).toBe(`defmodule App.Tag do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          posts: [App.Post.t()]
        }

  schema "Tag" do
    many_to_many(:posts, App.Post, join_through: "_PostTags", join_keys: [B: :id, A: :id])
  end
end`)
  })
})

describe('enum default', () => {
  it('carries @default on an enum field into the Ecto.Enum default option', () => {
    const account = makeModel({
      name: 'Account',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'status',
          type: 'Status',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'ACTIVE',
        }),
      ],
    })
    const enums = [
      {
        name: 'Status',
        values: [
          { name: 'ACTIVE', dbName: null },
          { name: 'INACTIVE', dbName: null },
        ],
        dbName: null,
      },
    ] as unknown as DMMF.DatamodelEnum[]

    expect(ectoSchemas([account], 'App', undefined, enums)).toBe(`defmodule App.Account do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          status: atom()
        }

  schema "Account" do
    field(:status, Ecto.Enum, values: [:ACTIVE, :INACTIVE], default: :ACTIVE)
  end
end`)
  })
})

// The two exported maps are the whole of Ecto's type vocabulary as this generator knows it, and
// both fall back rather than emitting an Elixir type that does not exist.
describe('prismaTypeToEctoType', () => {
  it.each([
    ['Int', 'integer'],
    ['BigInt', 'integer'],
    ['Float', 'float'],
    ['Decimal', 'decimal'],
    ['String', 'string'],
    ['Boolean', 'boolean'],
    ['DateTime', 'utc_datetime'],
    ['Json', 'map'],
    ['Bytes', 'binary'],
    ['Role', 'string'],
  ] as const)('maps %s to %s', (prisma, ecto) => {
    expect(prismaTypeToEctoType(prisma)).toBe(ecto)
  })
})

describe('ectoTypeToTypespec', () => {
  it.each([
    ['string', 'String.t()'],
    ['integer', 'integer()'],
    ['float', 'float()'],
    ['boolean', 'boolean()'],
    ['binary_id', 'Ecto.UUID.t()'],
    ['Ecto.ULID', 'Ecto.ULID.t()'],
    ['naive_datetime', 'NaiveDateTime.t()'],
    ['utc_datetime', 'DateTime.t()'],
    ['decimal', 'Decimal.t()'],
    ['map', 'map()'],
    ['binary', 'binary()'],
    ['whatever', 'term()'],
  ] as const)('spells %s as %s', (ecto, typespec) => {
    expect(ectoTypeToTypespec(ecto)).toBe(typespec)
  })
})

// A Json `@default` arrives as JSON text and has to come out as an Elixir literal, escapes and
// all - `#{}` most of all, which Elixir would otherwise interpolate at compile time. Ecto's
// `:map` only accepts a map, so an array or scalar default stays a database-level concern.
describe('Json defaults', () => {
  it.each([
    ['{"a":1}', '    field(:meta, :map, default: %{"a" => 1})'],
    [
      '{"nested":{"k":[1,"two",null,true,false]}}',
      '    field(:meta, :map, default: %{"nested" => %{"k" => [1, "two", nil, true, false]}})',
    ],
    ['{"k":"a\\"b\\n#{x}\\r"}', '    field(:meta, :map, default: %{"k" => "a\\"b\\n\\#{x}\\r"})'],
    ['[1,2]', '    field(:meta, :map)'],
    ['42', '    field(:meta, :map)'],
  ])('renders the default %s', (json, expected) => {
    const models = [
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'meta', type: 'Json', hasDefaultValue: true, default: json }),
        ],
      }),
    ]
    const lines = ectoSchemas(models, 'App', models).split('\n')
    expect(lines.find((line) => line.includes(':meta'))).toBe(expected)
  })
})

// What examples/ecto found running the generated schemas against Ecto on SQLite.
describe('keys and references Ecto names differently from Prisma', () => {
  const account = makeModel({
    name: 'Account',
    fields: [
      makeField({
        name: 'id',
        type: 'Int',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      makeField({ name: 'handle', type: 'String', isUnique: true }),
      makeField({
        name: 'orders',
        type: 'Order',
        kind: 'object',
        isList: true,
        relationName: 'Orders',
      }),
      makeField({
        name: 'gifts',
        type: 'Order',
        kind: 'object',
        isList: true,
        relationName: 'Gifts',
      }),
      makeField({
        name: 'wishlist',
        type: 'Wishlist',
        kind: 'object',
        isRequired: false,
        relationName: 'AccountToWishlist',
      }),
    ],
  })
  const order = makeModel({
    name: 'Order',
    fields: [
      makeField({
        name: 'number',
        type: 'Int',
        dbName: 'order_number',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      makeField({ name: 'accountId', type: 'Int', dbName: 'account_id' }),
      makeField({
        name: 'account',
        type: 'Account',
        kind: 'object',
        relationName: 'Orders',
        relationFromFields: ['accountId'],
        relationToFields: ['id'],
      }),
      makeField({ name: 'giftFor', type: 'String', dbName: 'gift_for', isRequired: false }),
      makeField({
        name: 'giftTarget',
        type: 'Account',
        kind: 'object',
        isRequired: false,
        relationName: 'Gifts',
        relationFromFields: ['giftFor'],
        relationToFields: ['handle'],
      }),
      makeField({
        name: 'lineItems',
        type: 'LineItem',
        kind: 'object',
        isList: true,
        relationName: 'LineItemToOrder',
      }),
    ],
  })
  const lineItem = makeModel({
    name: 'LineItem',
    primaryKey: { name: null, fields: ['orderNumber', 'sku'] },
    fields: [
      makeField({ name: 'orderNumber', type: 'Int', dbName: 'order_number' }),
      makeField({
        name: 'order',
        type: 'Order',
        kind: 'object',
        relationName: 'LineItemToOrder',
        relationFromFields: ['orderNumber'],
        relationToFields: ['number'],
      }),
      makeField({ name: 'sku', type: 'String' }),
    ],
  })
  const wishlist = makeModel({
    name: 'Wishlist',
    fields: [
      makeField({
        name: 'id',
        type: 'String',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [4] },
      }),
      makeField({ name: 'accountId', type: 'Int', dbName: 'account_id', isUnique: true }),
      makeField({
        name: 'account',
        type: 'Account',
        kind: 'object',
        relationName: 'AccountToWishlist',
        relationFromFields: ['accountId'],
        relationToFields: ['id'],
      }),
    ],
  })
  const models = [account, order, lineItem, wishlist]

  it('references a primary key Ecto calls :id by that name', () => {
    expect(ectoSchemas([lineItem], 'App', models)).toBe(`defmodule App.LineItem do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          order_number: term(),
          sku: String.t(),
          order: App.Order.t() | nil
        }

  schema "LineItem" do
    field(:sku, :string, primary_key: true)
    field(:order_number, :id, primary_key: true)
    belongs_to(:order, App.Order, foreign_key: :order_number, define_field: false)
  end
end`)
  })

  it('types a key after the unique field it references, and says it on both sides', () => {
    expect(ectoSchemas([order], 'App', models)).toBe(`defmodule App.Order do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true, source: :order_number}

  @type t :: %__MODULE__{
          id: integer(),
          account: App.Account.t() | nil,
          gift_target: App.Account.t() | nil,
          line_items: [App.LineItem.t()]
        }

  schema "Order" do
    belongs_to(:account, App.Account, foreign_key: :account_id)
    belongs_to(:gift_target, App.Account, foreign_key: :gift_for, type: :string, references: :handle)
    has_many(:line_items, App.LineItem, foreign_key: :order_number)
  end
end`)
    expect(ectoSchemas([account], 'App', models)).toBe(`defmodule App.Account do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          handle: String.t(),
          wishlist: App.Wishlist.t() | nil,
          orders: [App.Order.t()],
          gifts: [App.Order.t()]
        }

  schema "Account" do
    field(:handle, :string)
    has_one(:wishlist, App.Wishlist, foreign_key: :account_id)
    has_many(:orders, App.Order, foreign_key: :account_id)
    has_many(:gifts, App.Order, foreign_key: :gift_for, references: :handle)
  end
end`)
  })

  it('keeps an integer key of a uuid-keyed model out of its @foreign_key_type', () => {
    expect(ectoSchemas([wishlist], 'App', models)).toBe(`defmodule App.Wishlist do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          account: App.Account.t() | nil
        }

  schema "Wishlist" do
    belongs_to(:account, App.Account, foreign_key: :account_id, type: :id)
  end
end`)
  })
})

describe('implicit many-to-many of a model with itself', () => {
  it('reads its own key from "A" on the field whose name sorts first, and from "B" on the other', () => {
    const account = makeModel({
      name: 'Account',
      fields: [
        makeField({
          name: 'number',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'following',
          type: 'Account',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
        makeField({
          name: 'followers',
          type: 'Account',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
      ],
    })

    expect(ectoSchemas([account], 'App', [account])).toBe(`defmodule App.Account do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true, source: :number}

  @type t :: %__MODULE__{
          id: integer(),
          following: [App.Account.t()],
          followers: [App.Account.t()]
        }

  schema "Account" do
    many_to_many(:following, App.Account, join_through: "_Follows", join_keys: [B: :id, A: :id])
    many_to_many(:followers, App.Account, join_through: "_Follows", join_keys: [A: :id, B: :id])
  end
end`)
  })

  it('takes a self relation whose list side comes first for a has_many, not a many_to_many', () => {
    const category = makeModel({
      name: 'Category',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'children',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'Tree',
        }),
        makeField({ name: 'parentId', type: 'Int', isRequired: false }),
        makeField({
          name: 'parent',
          type: 'Category',
          kind: 'object',
          isRequired: false,
          relationName: 'Tree',
          relationFromFields: ['parentId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(ectoSchemas([category], 'App', [category])).toBe(`defmodule App.Category do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          parent: App.Category.t() | nil,
          children: [App.Category.t()]
        }

  schema "Category" do
    field(:parent_id, :id, source: :parentId)
    belongs_to(:parent, App.Category, foreign_key: :parent_id, define_field: false)
    has_many(:children, App.Category, foreign_key: :parent_id)
  end
end`)
  })
})

describe('defaults Ecto has to know about', () => {
  it('counts up a BigInt autoincrement key, gives a foreign key its default and makes a uuid() column', () => {
    const category = makeModel({
      name: 'Category',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
      ],
    })
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({
          name: 'id',
          type: 'BigInt',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'token',
          type: 'String',
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'category_id',
          type: 'Int',
          hasDefaultValue: true,
          default: 1,
        }),
        makeField({
          name: 'category',
          type: 'Category',
          kind: 'object',
          relationName: 'CategoryToEvent',
          relationFromFields: ['category_id'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(ectoSchemas([event], 'App', [category, event])).toBe(`defmodule App.Event do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          token: String.t(),
          category: App.Category.t() | nil
        }

  schema "Event" do
    field(:token, :string, autogenerate: {Ecto.UUID, :generate, []})
    field(:category_id, :id, default: 1)
    belongs_to(:category, App.Category, foreign_key: :category_id, define_field: false)
  end
end`)
  })
})

describe('@moduledoc', () => {
  it('keeps a doc comment as text: no interpolation, escape or end of the heredoc', () => {
    const model = makeModel({
      name: 'Note',
      documentation: 'Says #{name}, a backslash \\n and a """ quote.',
      fields: [makeField({ name: 'id', type: 'Int', isId: true })],
    })

    expect(ectoSchemas([model], 'App')).toBe(`defmodule App.Note do
  use Ecto.Schema
  @moduledoc """
  Says \\#{name}, a backslash \\\\n and a \\""" quote.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: integer()
        }

  schema "Note" do
    field(:id, :integer, primary_key: true)
  end
end`)
  })
})

describe('changeset', () => {
  const autoincrementId = makeField({
    name: 'id',
    type: 'Int',
    isId: true,
    hasDefaultValue: true,
    default: { name: 'autoincrement', args: [] },
  })

  it('writes the @ecto. lines of a field into its changeset, after what the schema requires', () => {
    const model = makeModel({
      name: 'User',
      fields: [
        autoincrementId,
        makeField({
          name: 'name',
          type: 'String',
          documentation: [
            '@ecto.validate_required(message: "名前を入力してください")',
            '@ecto.validate_length(max: 50, message: "%{count}文字以内で入力してください")',
          ].join('\n'),
        }),
        makeField({ name: 'age', type: 'Int', isRequired: false }),
        makeField({ name: 'email', type: 'String', isRequired: false }),
        makeField({ name: 'handle', type: 'String' }),
        makeField({ name: 'role', type: 'String', hasDefaultValue: true, default: 'member' }),
      ],
    })

    expect(ectoSchemas([model], 'App', undefined, undefined, { provider: 'postgresql' }))
      .toBe(`defmodule App.User do
  use Ecto.Schema
  import Ecto.Changeset
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          age: integer() | nil,
          email: String.t() | nil,
          handle: String.t(),
          role: String.t()
        }

  schema "User" do
    field(:name, :string)
    field(:age, :integer)
    field(:email, :string)
    field(:handle, :string)
    field(:role, :string, default: "member")
  end

  @spec changeset(t(), map()) :: Ecto.Changeset.t()
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:name, :age, :email, :handle, :role])
    |> validate_required([:handle])
    |> validate_required([:name], message: "名前を入力してください")
    |> validate_length(:name, max: 50, message: "%{count}文字以内で入力してください")
  end
end`)
  })

  it('writes no changeset where no @ecto line asks for one', () => {
    const model = makeModel({
      name: 'User',
      fields: [autoincrementId, makeField({ name: 'email', type: 'String', isUnique: true })],
    })

    expect(ectoSchemas([model], 'App')).not.toContain('changeset')
  })

  it('takes a bare @ecto on a model for the changeset the schema implies, and a model line as a step', () => {
    const model = makeModel({
      name: 'Account',
      dbName: 'accounts',
      documentation: [
        'Someone who signs in.',
        '@ecto',
        '@ecto.validate_confirmation(:password, message: "does not match")',
      ].join('\n'),
      fields: [
        autoincrementId,
        makeField({ name: 'password', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    const result = ectoSchemas([model], 'App', undefined, undefined, { provider: 'sqlite' })

    expect(result).toContain(`  @moduledoc """
  Someone who signs in.
  """`)
    expect(result).toContain(`  def changeset(account, attrs) do
    account
    |> cast(attrs, [:password])
    |> validate_required([:password])
    |> validate_confirmation(:password, message: "does not match")
  end`)
  })

  it('names each unique constraint as the database reports it', () => {
    const model = makeModel({
      name: 'Review',
      dbName: 'reviews',
      uniqueFields: [['productId', 'accountId']],
      documentation: '@ecto',
      fields: [
        autoincrementId,
        makeField({
          name: 'slug',
          type: 'String',
          isUnique: true,
          documentation: '@ecto.unique_constraint(message: "既に使われています")',
        }),
        makeField({ name: 'code', type: 'String', isUnique: true, dbName: 'review_code' }),
        makeField({ name: 'productId', type: 'Int', dbName: 'product_id' }),
        makeField({ name: 'accountId', type: 'Int', dbName: 'account_id' }),
      ],
    })
    const indexes: DMMF.Index[] = [
      {
        model: 'Review',
        type: 'unique',
        isDefinedOnField: true,
        dbName: 'reviews_code_uq',
        fields: [{ name: 'code' }],
      },
    ]

    expect(ectoSchemas([model], 'App', undefined, undefined, { provider: 'postgresql', indexes }))
      .toContain(`    |> unique_constraint(:slug, message: "既に使われています", name: "reviews_slug_key")
    |> unique_constraint(:code, name: "reviews_code_uq")
    |> unique_constraint([:product_id, :account_id], name: "reviews_product_id_account_id_key")
  end`)
    // ecto_sqlite3 reports `<table>_<columns>_index`, the name Ecto derives on its own.
    expect(ectoSchemas([model], 'App', undefined, undefined, { provider: 'sqlite' }))
      .toContain(`    |> unique_constraint(:slug, message: "既に使われています")
    |> unique_constraint(:code)
    |> unique_constraint([:product_id, :account_id])
  end`)
  })

  it('cuts a derived name to what the database takes, as Prisma Migrate does', () => {
    const model = makeModel({
      name: 'Pair',
      dbName: 'long_table',
      uniqueFields: [['firstExtremelyLongColumnName', 'secondExtremelyLongColumnName']],
      documentation: '@ecto',
      fields: [
        autoincrementId,
        makeField({
          name: 'anExtremelyLongColumnNameThatIsLongerThanUsualAndEvenLongerStill',
          type: 'String',
          isUnique: true,
        }),
        makeField({ name: 'firstExtremelyLongColumnName', type: 'Int' }),
        makeField({ name: 'secondExtremelyLongColumnName', type: 'Int' }),
      ],
    })
    // What `prisma migrate diff --script` writes for this model on each database.
    const names = (provider: string) =>
      [
        ...ectoSchemas([model], 'App', undefined, undefined, { provider }).matchAll(
          /name: "([^"]+)"/gu,
        ),
      ].map((m) => m[1])

    expect(names('postgresql')).toStrictEqual([
      'long_table_anExtremelyLongColumnNameThatIsLongerThanUsualAn_key',
      'long_table_firstExtremelyLongColumnName_secondExtremelyLong_key',
    ])
    expect(names('mysql')).toStrictEqual([
      'long_table_anExtremelyLongColumnNameThatIsLongerThanUsualAnd_key',
      'long_table_firstExtremelyLongColumnName_secondExtremelyLongC_key',
    ])
    expect(names('sqlserver')).toStrictEqual([
      'long_table_anExtremelyLongColumnNameThatIsLongerThanUsualAndEvenLongerStill_key',
      'long_table_firstExtremelyLongColumnName_secondExtremelyLongColumnName_key',
    ])
  })

  it('takes a model line on the fields of a @@unique as that constraint, and a name: in a message as text', () => {
    const model = makeModel({
      name: 'Review',
      dbName: 'reviews',
      uniqueFields: [['productId', 'accountId']],
      documentation:
        '@ecto.unique_constraint([:product_id, :account_id], message: "レビュー済みです")',
      fields: [
        autoincrementId,
        makeField({
          name: 'slug',
          type: 'String',
          isUnique: true,
          documentation: '@ecto.unique_constraint(message: "name: is taken")',
        }),
        makeField({ name: 'productId', type: 'Int', dbName: 'product_id' }),
        makeField({ name: 'accountId', type: 'Int', dbName: 'account_id' }),
      ],
    })

    expect(ectoSchemas([model], 'App', undefined, undefined, { provider: 'postgresql' }))
      .toContain(`    |> unique_constraint(:slug, message: "name: is taken", name: "reviews_slug_key")
    |> unique_constraint([:product_id, :account_id], message: "レビュー済みです", name: "reviews_product_id_account_id_key")
  end`)
  })

  it('does not name the struct after the attrs it is given', () => {
    const model = makeModel({
      name: 'Attrs',
      documentation: '@ecto',
      fields: [autoincrementId],
    })

    expect(ectoSchemas([model], 'App')).toContain('  def changeset(attrs_struct, attrs) do')
  })

  describe('foreign keys', () => {
    const account = makeModel({
      name: 'Account',
      fields: [
        autoincrementId,
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'AccountToPost',
          documentation: '@ecto.no_assoc_constraint(message: "has posts")',
        }),
        makeField({
          name: 'edits',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'Edits',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      dbName: 'posts',
      documentation: '@ecto',
      fields: [
        autoincrementId,
        makeField({
          name: 'authorId',
          type: 'Int',
          dbName: 'author_id',
          documentation: '@ecto.foreign_key_constraint(message: "no such author")',
        }),
        makeField({
          name: 'author',
          type: 'Account',
          kind: 'object',
          relationName: 'AccountToPost',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
        }),
        makeField({ name: 'editorId', type: 'Int', isRequired: false }),
        makeField({
          name: 'editor',
          type: 'Account',
          kind: 'object',
          isRequired: false,
          relationName: 'Edits',
          relationFromFields: ['editorId'],
          relationToFields: ['id'],
          documentation: '@ecto.assoc_constraint',
        }),
      ],
    })
    // The name `map:` gives, which DMMF drops, read off the schema's text.
    const foreignKeyNames = relationMaps(`model Post {
  editor Account? @relation("Edits", fields: [editorId], references: [id], map: "post_editor_fk")
}`)
    const changeset = (model: DMMF.Model, provider: string, relationMode?: string) =>
      ectoSchemas([model], 'App', [account, post], undefined, {
        provider,
        foreignKeyNames,
        relationMode,
      })

    it('names each as Prisma Migrate does, and puts a relation asking for it on the association', () => {
      // posts_author_id_fkey and post_editor_fk are what `prisma migrate diff --script` writes.
      expect(changeset(post, 'postgresql')).toContain(`    |> cast(attrs, [:author_id, :editor_id])
    |> validate_required([:author_id])
    |> foreign_key_constraint(:author_id, message: "no such author", name: "posts_author_id_fkey")
    |> assoc_constraint(:editor, name: "post_editor_fk")
  end`)
    })

    it('names the key a has_many is followed by for its no_assoc_constraint', () => {
      expect(
        ectoSchemas([{ ...account, documentation: '@ecto' }], 'App', [account, post], undefined, {
          provider: 'postgresql',
        }),
      )
        .toContain(`    |> no_assoc_constraint(:posts, message: "has posts", name: "posts_author_id_fkey")
  end`)
    })

    it('writes none SQLite could match, nor one relationMode prisma leaves out of the database', () => {
      // ecto_sqlite3 reports a violated foreign key with no name: only what a line asks is written.
      expect(changeset(post, 'sqlite')).toContain(`    |> cast(attrs, [:author_id, :editor_id])
    |> validate_required([:author_id])
    |> foreign_key_constraint(:author_id, message: "no such author")
    |> assoc_constraint(:editor)
  end`)
      const comment = makeModel({
        name: 'Comment',
        documentation: '@ecto',
        fields: [
          autoincrementId,
          makeField({ name: 'authorId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'Account',
            kind: 'object',
            relationName: 'AccountToComment',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
          }),
        ],
      })
      expect(changeset(comment, 'postgresql')).toContain(
        '    |> foreign_key_constraint(:author_id, name: "Comment_authorId_fkey")',
      )
      expect(changeset(comment, 'postgresql', 'prisma')).not.toContain('foreign_key_constraint')
    })

    it('cuts a name of several bytes a character to the database’s limit in bytes', () => {
      const owner = makeModel({
        name: 'O',
        fields: [autoincrementId],
      })
      const model = makeModel({
        name: 'T',
        documentation: '@ecto',
        fields: [
          autoincrementId,
          makeField({
            name: 'name',
            type: 'String',
            isUnique: true,
            dbName:
              'とても長い日本語の列名がここにありますとても長い日本語の列名がここにありますとても長い日本語の列名',
          }),
          makeField({
            name: 'ownerId',
            type: 'Int',
            dbName:
              '所有者の識別子がとても長い名前になっている場合所有者の識別子がとても長い名前になっている場合',
          }),
          makeField({
            name: 'owner',
            type: 'O',
            kind: 'object',
            relationName: 'OToT',
            relationFromFields: ['ownerId'],
            relationToFields: ['id'],
          }),
        ],
      })
      const names = (provider: string) =>
        [
          ...ectoSchemas([model], 'App', [owner, model], undefined, { provider }).matchAll(
            /name: "([^"]+)"/gu,
          ),
        ].map((m) => m[1])

      // What `prisma migrate diff --script` writes for this model on each database.
      expect(names('postgresql')).toStrictEqual([
        'T_とても長い日本語の列名がここにあります_key',
        'T_所有者の識別子がとても長い名前になっ_fkey',
      ])
      expect(names('mysql')).toStrictEqual([
        'T_とても長い日本語の列名がここにあります_key',
        'T_所有者の識別子がとても長い名前になって_fkey',
      ])
      expect(names('sqlserver')).toStrictEqual([
        'T_とても長い日本語の列名がここにありますとても長い日本語の列名がここにありますとて_key',
        'T_所有者の識別子がとても長い名前になっている場合所有者の識別子がとても長い名前にな_fkey',
      ])
    })

    it('refuses the delete of a row whose has_many the database keeps, and no other', () => {
      const relation = (name: string, type: string, relationName: string) =>
        makeField({ name, type, kind: 'object', isList: true, relationName })
      const holder = (name: string, relationName: string, overrides: Partial<DMMF.Field> = {}) =>
        makeModel({
          name,
          fields: [
            autoincrementId,
            makeField({ name: 'userId', type: 'Int', isRequired: overrides.isRequired ?? true }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName,
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              ...overrides,
            }),
          ],
        })
      const user = makeModel({
        name: 'User',
        documentation: '@ecto',
        fields: [
          autoincrementId,
          // Required and naming no onDelete: Prisma restricts it.
          relation('orders', 'Order', 'OrderToUser'),
          relation('invoices', 'Invoice', 'InvoiceToUser'),
          relation('sessions', 'Session', 'SessionToUser'),
          relation('visits', 'Visit', 'UserToVisit'),
        ],
      })
      const models = [
        user,
        holder('Order', 'OrderToUser'),
        holder('Invoice', 'InvoiceToUser', { relationOnDelete: 'NoAction' }),
        holder('Session', 'SessionToUser', { relationOnDelete: 'Cascade' }),
        // Optional and naming no onDelete: Prisma sets it null.
        holder('Visit', 'UserToVisit', { isRequired: false }),
      ]
      const userChangeset = (provider: string, relationMode?: string) =>
        ectoSchemas([user], 'App', models, undefined, { provider, relationMode })

      expect(userChangeset('postgresql')).toContain(`    user
    |> cast(attrs, [])
    |> no_assoc_constraint(:orders, name: "Order_userId_fkey")
    |> no_assoc_constraint(:invoices, name: "Invoice_userId_fkey")
  end`)
      expect(userChangeset('sqlite')).not.toContain('no_assoc_constraint')
      expect(userChangeset('postgresql', 'prisma')).not.toContain('no_assoc_constraint')
    })

    it('puts a key of several columns, which Ecto has no association for, on the relation’s name', () => {
      const pair = makeModel({
        name: 'Pair',
        primaryKey: { name: null, fields: ['a', 'b'] },
        documentation: '@ecto',
        fields: [
          makeField({ name: 'a', type: 'Int' }),
          makeField({ name: 'b', type: 'Int' }),
          makeField({
            name: 'children',
            type: 'Child',
            kind: 'object',
            isList: true,
            relationName: 'ChildToPair',
          }),
          makeField({
            name: 'favourite',
            type: 'Child',
            kind: 'object',
            isRequired: false,
            relationName: 'Favourite',
            documentation: '@ecto.no_assoc_constraint(message: "is someone’s favourite")',
          }),
        ],
      })
      const child = makeModel({
        name: 'Child',
        documentation: '@ecto',
        fields: [
          autoincrementId,
          makeField({ name: 'pa', type: 'Int' }),
          makeField({ name: 'pb', type: 'Int' }),
          makeField({
            name: 'pair',
            type: 'Pair',
            kind: 'object',
            relationName: 'ChildToPair',
            relationFromFields: ['pa', 'pb'],
            relationToFields: ['a', 'b'],
            documentation: '@ecto.assoc_constraint(message: "no such pair")',
          }),
          makeField({ name: 'fa', type: 'Int', isRequired: false }),
          makeField({ name: 'fb', type: 'Int', isRequired: false }),
          makeField({
            name: 'favouriteOf',
            type: 'Pair',
            kind: 'object',
            isRequired: false,
            relationName: 'Favourite',
            relationFromFields: ['fa', 'fb'],
            relationToFields: ['a', 'b'],
          }),
        ],
      })
      const generate = (model: DMMF.Model) =>
        ectoSchemas([model], 'App', [pair, child], undefined, { provider: 'postgresql' })

      // Child_pa_pb_fkey is what `prisma migrate diff --script` names the key.
      expect(generate(pair))
        .toContain(`    |> foreign_key_constraint(:children, message: "are still associated with this entry", name: "Child_pa_pb_fkey")
    |> foreign_key_constraint(:favourite, message: "is someone’s favourite", name: "Child_fa_fb_fkey")
  end`)
      expect(generate(child))
        .toContain(`    |> foreign_key_constraint(:pair, message: "no such pair", name: "Child_pa_pb_fkey")
    |> foreign_key_constraint(:fa, name: "Child_fa_fb_fkey")
  end`)
      expect(ectoProblems([pair, child])).toStrictEqual([])
    })

    it('names what a relation field cannot take', () => {
      const owner = makeModel({
        name: 'Account',
        fields: [
          autoincrementId,
          makeField({
            name: 'edits',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'Edits',
            documentation: '@ecto.assoc_constraint',
          }),
        ],
      })
      const edited = makeModel({
        name: 'Post',
        fields: [
          autoincrementId,
          makeField({
            name: 'editorId',
            type: 'Int',
            documentation: '@ecto.cast(empty_values: [])',
          }),
          makeField({
            name: 'editor',
            type: 'Account',
            kind: 'object',
            relationName: 'Edits',
            relationFromFields: ['editorId'],
            relationToFields: ['id'],
            documentation: '@ecto.no_assoc_constraint',
          }),
          makeField({
            name: 'label',
            type: 'String',
            documentation: '@ecto.foreign_key_constraint',
          }),
        ],
      })

      expect(ectoProblems([owner, edited])).toStrictEqual([
        'field Account.edits: assoc_constraint is on a relation whose foreign key is not a column of this model; it belongs on the side with the key',
        'field Post.editorId: cast is not an Ecto.Changeset function that takes the field first; write it as an @ecto. line on the model',
        'field Post.editor: no_assoc_constraint is on a relation that is not a has_one or has_many; it belongs on the side the key points at',
        'field Post.label: foreign_key_constraint is on a field that is not the foreign key of a relation',
      ])
    })
  })

  it('hands the options of a model’s cast line to the changeset’s cast, and then requires only what is not nil', () => {
    const model = makeModel({
      name: 'Note',
      documentation: '@ecto.cast(empty_values: [])',
      fields: [
        autoincrementId,
        makeField({ name: 'body', type: 'String' }),
        makeField({
          name: 'title',
          type: 'String',
          documentation: '@ecto.validate_required(message: "blank is missing here")',
        }),
      ],
    })

    expect(ectoSchemas([model], 'App')).toContain(`  def changeset(note, attrs) do
    note
    |> cast(attrs, [:body, :title], empty_values: [])
    |> validate_not_null([:body])
    |> validate_required([:title], message: "blank is missing here")
  end

  # validate_required/3 for a column that takes "": missing is nil, and nothing else.
  defp validate_not_null(changeset, fields) do
    changeset = %{changeset | required: Enum.uniq(changeset.required ++ fields)}

    Enum.reduce(fields, changeset, fn field, acc ->
      if is_nil(get_field(acc, field)) and not Keyword.has_key?(acc.errors, field),
        do: add_error(acc, field, "can't be blank", validation: :required),
        else: acc
    end)
  end
end`)
  })

  it('does not name the struct after a word Elixir reserves', () => {
    const model = makeModel({
      name: 'End',
      documentation: '@ecto',
      fields: [autoincrementId, makeField({ name: 'at', type: 'String' })],
    })

    expect(ectoSchemas([model], 'App')).toContain(`  def changeset(end_struct, attrs) do
    end_struct`)
  })
})

describe('ectoProblems', () => {
  it('names what keeps an @ecto. line from being read', () => {
    const model = makeModel({
      name: 'User',
      documentation: '@ecto\nWritten after the call.',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
          documentation: '@ecto.validate_number(greater_than: 0)',
        }),
        makeField({
          name: 'name',
          type: 'String',
          documentation: '@ecto.validate_length(max: 50\n@ecto.unique_constraint',
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
          documentation: '@ecto.validate_length(min: 1)',
        }),
        makeField({ name: 'bio', type: 'String', documentation: '@ecto.validate_length 50' }),
      ],
    })

    expect(ectoProblems([model])).toStrictEqual([
      'model User: the line "Written after the call." comes after an @ecto. call; write the description above them',
      'field User.id: an @ecto. call is on a field the changeset does not cast: a primary key Ecto generates, or a timestamp',
      'field User.name: the @ecto. call "validate_length(max: 50" does not close its parentheses on its line; an @ecto. call is one /// line',
      'field User.name: unique_constraint is on a field that is not @unique; write a @@unique constraint as an @ecto. line on the model',
      'field User.posts: validate_length is on a relation field, which takes assoc_constraint or no_assoc_constraint; write it as an @ecto. line on the model',
      'field User.bio: the @ecto. call "validate_length 50" is not name or name(arguments)',
    ])
  })
})
