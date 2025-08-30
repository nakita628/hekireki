defmodule DBSchema.Comment do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          userId: String.t(),
          postId: String.t()
        }

  schema "comment" do
    field(:body, :string)
    field(:userId, :string)
    field(:postId, :string)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end