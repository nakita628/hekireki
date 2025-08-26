defmodule DBSchema.Notification do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          userId: String.t()
        }

  schema "notification" do
    field(:body, :string)
    field(:userId, :string)
    timestamps(inserted_at: :createdAt, updated_at: :updated_at)
  end
end