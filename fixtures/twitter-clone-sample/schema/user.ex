defmodule DBSchema.User do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          username: String.t(),
          bio: String.t() | nil,
          email: String.t(),
          email_verified: DateTime.t() | nil,
          image: String.t() | nil,
          cover_image: String.t() | nil,
          profile_image: String.t() | nil,
          hashed_password: String.t() | nil,
          has_notification: boolean() | nil,
          posts: [DBSchema.Post.t()],
          comments: [DBSchema.Comment.t()],
          notifications: [DBSchema.Notification.t()],
          followers: [DBSchema.Follow.t()],
          following: [DBSchema.Follow.t()],
          likes: [DBSchema.Like.t()]
        }

  schema "user" do
    field(:name, :string)
    field(:username, :string)
    field(:bio, :string, default: "")
    field(:email, :string)
    field(:email_verified, :utc_datetime, source: :emailVerified)
    field(:image, :string)
    field(:cover_image, :string, source: :coverImage)
    field(:profile_image, :string, source: :profileImage)
    field(:hashed_password, :string, source: :hashedPassword)
    field(:has_notification, :boolean, default: false, source: :hasNotification)
    has_many(:posts, DBSchema.Post, foreign_key: :user_id)
    has_many(:comments, DBSchema.Comment, foreign_key: :user_id)
    has_many(:notifications, DBSchema.Notification, foreign_key: :user_id)
    has_many(:followers, DBSchema.Follow, foreign_key: :following_id)
    has_many(:following, DBSchema.Follow, foreign_key: :follower_id)
    has_many(:likes, DBSchema.Like, foreign_key: :user_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end