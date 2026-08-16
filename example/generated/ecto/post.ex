defmodule Example.Post do
  use Ecto.Schema
  @moduledoc """
  @@map + @map column names, FK with a referential action,
  mapped-enum default, and an implicit many-to-many to Tag.
  """

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t() | nil,
          visibility: atom(),
          published: boolean(),
          view_count: integer(),
          author: Example.User.t() | nil,
          comments: [Example.Comment.t()],
          tags: [Example.Tag.t()]
        }

  schema "posts" do
    field(:title, :string)
    field(:content, :string)
    field(:visibility, Ecto.Enum, values: [PUBLIC: "public", PRIVATE: "private", LINK_ONLY: "link_only"], default: :LINK_ONLY)
    field(:published, :boolean, default: false)
    field(:view_count, :integer, default: 0)
    belongs_to(:author, Example.User, foreign_key: :author_id)
    has_many(:comments, Example.Comment, foreign_key: :post_id)
    many_to_many(:tags, Example.Tag, join_through: "_PostToTag", join_keys: [A: :id, B: :id])
    timestamps(type: :utc_datetime, inserted_at_source: :created_at, updated_at: false)
  end
end