defmodule DBSchema.Follow do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          follower_id: Ecto.UUID.t(),
          following_id: Ecto.UUID.t(),
          follower: DBSchema.User.t() | nil,
          following: DBSchema.User.t() | nil
        }

  schema "follow" do
    field(:follower_id, :binary_id, primary_key: true, source: :followerId)
    field(:following_id, :binary_id, primary_key: true, source: :followingId)
    belongs_to(:follower, DBSchema.User, foreign_key: :follower_id, define_field: false, type: :binary_id)
    belongs_to(:following, DBSchema.User, foreign_key: :following_id, define_field: false, type: :binary_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt)
  end
end