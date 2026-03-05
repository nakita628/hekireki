defmodule DBSchema.Like do
  use Ecto.Schema
  @moduledoc false

  @primary_key false

  @type t :: %__MODULE__{
          user_id: Ecto.UUID.t(),
          post_id: Ecto.UUID.t(),
          user: DBSchema.User.t() | nil,
          post: DBSchema.Post.t() | nil
        }

  schema "like" do
    field(:user_id, :binary_id, primary_key: true, source: :userId)
    field(:post_id, :binary_id, primary_key: true, source: :postId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false, type: :binary_id)
    belongs_to(:post, DBSchema.Post, foreign_key: :post_id, define_field: false, type: :binary_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt)
  end
end