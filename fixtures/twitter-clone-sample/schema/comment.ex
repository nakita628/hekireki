defmodule DBSchema.Comment do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          user: DBSchema.User.t() | nil,
          post: DBSchema.Post.t() | nil
        }

  schema "comment" do
    field(:body, :string)
    field(:user_id, :binary_id, source: :userId)
    field(:post_id, :binary_id, source: :postId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
    belongs_to(:post, DBSchema.Post, foreign_key: :post_id, define_field: false)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end