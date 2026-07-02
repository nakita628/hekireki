defmodule DBSchema.Post do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          published: boolean(),
          author: DBSchema.User.t() | nil,
          tags: [DBSchema.Tag.t()]
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    field(:published, :boolean, default: false)
    field(:author_id, :binary_id, source: :authorId)
    belongs_to(:author, DBSchema.User, foreign_key: :author_id, define_field: false)
    many_to_many(:tags, DBSchema.Tag, join_through: "_PostToTag")
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end