defmodule DBSchema.Profile do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          bio: String.t(),
          avatar: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "profile" do
    field(:bio, :string)
    field(:avatar, :string)
    belongs_to(:user, DBSchema.User, foreign_key: :userId, type: :binary_id)
  end
end