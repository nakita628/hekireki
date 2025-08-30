defmodule DBSchema.Like do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          userId: String.t(),
          postId: String.t()
        }

  schema "like" do
    field(:userId, :string)
    field(:postId, :string)
    timestamps(inserted_at: :createdAt, updated_at: :updated_at)
  end
end