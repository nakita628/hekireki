defmodule DBSchema.Follow do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          followerId: String.t(),
          followingId: String.t()
        }

  schema "follow" do
    field(:followerId, :string)
    field(:followingId, :string)
    timestamps(inserted_at: :createdAt, updated_at: :updated_at)
  end
end