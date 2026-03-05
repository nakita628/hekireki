defmodule DBSchema.Post do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          user: DBSchema.User.t() | nil,
          comments: [DBSchema.Comment.t()],
          likes: [DBSchema.Like.t()]
        }

  schema "post" do
    field(:body, :string)
    field(:user_id, :binary_id, source: :userId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
    has_many(:comments, DBSchema.Comment, foreign_key: :post_id)
    has_many(:likes, DBSchema.Like, foreign_key: :post_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end