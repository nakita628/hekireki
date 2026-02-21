defmodule DBSchema.Notification do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "notification" do
    field(:body, :string)
    belongs_to(:user, DBSchema.User, foreign_key: :userId, type: :binary_id)
    timestamps(inserted_at: :createdAt, updated_at: :updated_at)
  end
end