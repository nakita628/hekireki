defmodule DBSchema.Notification do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "notification" do
    field(:body, :string)
    field(:user_id, :binary_id, source: :userId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt)
  end
end