defmodule DBSchema.Profile do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          bio: String.t() | nil,
          avatar: String.t() | nil,
          user: DBSchema.User.t() | nil
        }

  schema "profile" do
    field(:bio, :string)
    field(:avatar, :string)
    field(:user_id, :binary_id, source: :userId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
  end
end