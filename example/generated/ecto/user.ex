defmodule Example.User do
  use Ecto.Schema
  @moduledoc """
  Application user. Fully annotated for every validator generator,
  with a UUIDv7 primary key, enum default, scalar list, @map columns,
  @updatedAt, and relations of every cardinality.
  """

  @primary_key {:id, Ecto.UUID, autogenerate: [version: 7]}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          email: String.t(),
          name: String.t(),
          role: atom(),
          interests: [String.t()],
          profile: Example.Profile.t() | nil,
          posts: [Example.Post.t()],
          comments: [Example.Comment.t()],
          orders: [Example.Order.t()],
          followers: [Example.Follow.t()],
          following: [Example.Follow.t()]
        }

  schema "users" do
    field(:email, :string)
    field(:name, :string)
    field(:role, Ecto.Enum, values: [:ADMIN, :EDITOR, :VIEWER], default: :VIEWER)
    field(:interests, {:array, :string})
    has_one(:profile, Example.Profile, foreign_key: :user_id)
    has_many(:posts, Example.Post, foreign_key: :author_id)
    has_many(:comments, Example.Comment, foreign_key: :author_id)
    has_many(:orders, Example.Order, foreign_key: :user_id)
    has_many(:followers, Example.Follow, foreign_key: :following_id)
    has_many(:following, Example.Follow, foreign_key: :follower_id)
    timestamps(type: :utc_datetime, inserted_at_source: :created_at)
  end
end