defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          email: String.t(),
          name: String.t(),
          age: integer(),
          isActive: boolean(),
          role: String.t(),
          profile: DBSchema.Profile.t() | nil,
          posts: [DBSchema.Post.t()]
        }

  schema "user" do
    field(:email, :string)
    field(:name, :string)
    field(:age, :integer)
    field(:isActive, :boolean, default: true)
    field(:role, :string, default: "MEMBER")
    has_one(:profile, DBSchema.Profile, foreign_key: :userId)
    has_many(:posts, DBSchema.Post, foreign_key: :authorId)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end