import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { ectoSchemaFiles } from './ecto.js'

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

const enums: DMMF.DatamodelEnum[] = [
  {
    name: 'Role',
    values: [
      { name: 'USER', dbName: null },
      { name: 'ADMIN', dbName: null },
    ],
    dbName: null,
  },
]

const models = [
  makeModel({
    name: 'User',
    documentation: 'A person.',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true, documentation: 'Primary key.' }),
      makeField({ name: 'name', type: 'String' }),
      makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      makeField({
        name: 'posts',
        type: 'BlogPost',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'BlogPostToUser',
      }),
    ],
  }),
  makeModel({
    name: 'BlogPost',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'authorId', type: 'Int', isReadOnly: true }),
      makeField({
        name: 'author',
        type: 'User',
        kind: 'object',
        relationName: 'BlogPostToUser',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ],
  }),
]

const bare = [
  makeModel({ name: 'Bare', fields: [makeField({ name: 'id', type: 'Int', isId: true })] }),
]

describe('ectoSchemaFiles', () => {
  it('writes one snake_case .ex file per model under the app module', () => {
    expect(ectoSchemaFiles(models, 'MyApp', enums)).toStrictEqual([
      {
        fileName: 'user.ex',
        code: `defmodule MyApp.User do
  use Ecto.Schema
  @moduledoc """
  A person.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          role: atom(),
          posts: [MyApp.BlogPost.t()]
        }

  schema "user" do
    field(:id, :integer, primary_key: true)
    field(:name, :string)
    field(:role, Ecto.Enum, values: [:USER, :ADMIN])
    has_many(:posts, MyApp.BlogPost, foreign_key: :author_id)
  end
end`,
      },
      {
        fileName: 'blog_post.ex',
        code: `defmodule MyApp.BlogPost do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          id: integer(),
          title: String.t(),
          author: MyApp.User.t() | nil
        }

  schema "blog_post" do
    field(:id, :integer, primary_key: true)
    field(:title, :string)
    field(:author_id, :id, source: :authorId)
    belongs_to(:author, MyApp.User, foreign_key: :author_id, define_field: false)
  end
end`,
      },
    ])
  })

  it('joins a nested app namespace with dots', () => {
    expect(ectoSchemaFiles(models, ['My', 'App'], enums)).toStrictEqual([
      {
        fileName: 'user.ex',
        code: `defmodule My.App.User do
  use Ecto.Schema
  @moduledoc """
  A person.
  """

  @primary_key false

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          role: atom(),
          posts: [My.App.BlogPost.t()]
        }

  schema "user" do
    field(:id, :integer, primary_key: true)
    field(:name, :string)
    field(:role, Ecto.Enum, values: [:USER, :ADMIN])
    has_many(:posts, My.App.BlogPost, foreign_key: :author_id)
  end
end`,
      },
      {
        fileName: 'blog_post.ex',
        code: `defmodule My.App.BlogPost do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          id: integer(),
          title: String.t(),
          author: My.App.User.t() | nil
        }

  schema "blog_post" do
    field(:id, :integer, primary_key: true)
    field(:title, :string)
    field(:author_id, :id, source: :authorId)
    belongs_to(:author, My.App.User, foreign_key: :author_id, define_field: false)
  end
end`,
      },
    ])
  })

  it('keeps a model that has nothing but a primary key', () => {
    expect(ectoSchemaFiles(bare, 'App')).toStrictEqual([
      {
        fileName: 'bare.ex',
        code: `defmodule App.Bare do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          id: integer()
        }

  schema "bare" do
    field(:id, :integer, primary_key: true)
  end
end`,
      },
    ])
  })

  it('emits nothing for a schema without models', () => {
    expect(ectoSchemaFiles([], 'App', enums)).toStrictEqual([])
  })
})
