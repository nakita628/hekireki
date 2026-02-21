defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          body: String.t(),
          user: DBSchema.User.t() | nil,
          comments: [DBSchema.Comment.t()],
          likes: [DBSchema.Like.t()]
        }

  schema "post" do
    field(:body, :string)
    belongs_to(:user, DBSchema.User, foreign_key: :userId, type: :binary_id)
    has_many(:comments, DBSchema.Comment, foreign_key: :postId)
    has_many(:likes, DBSchema.Like, foreign_key: :postId)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end