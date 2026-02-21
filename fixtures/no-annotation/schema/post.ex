defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          published: boolean(),
          author: DBSchema.User.t() | nil
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    field(:published, :boolean, default: false)
    belongs_to(:author, DBSchema.User, foreign_key: :authorId, type: :binary_id)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end