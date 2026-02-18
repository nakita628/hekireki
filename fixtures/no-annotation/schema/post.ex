defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          published: boolean(),
          authorId: String.t()
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    field(:published, :boolean, default: false)
    field(:authorId, :string)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end