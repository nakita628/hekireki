defmodule DBSchema.User do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          email: String.t(),
          name: String.t() | nil,
          age: integer() | nil,
          is_active: boolean(),
          role: atom(),
          profile: DBSchema.Profile.t() | nil,
          posts: [DBSchema.Post.t()]
        }

  schema "user" do
    field(:email, :string)
    field(:name, :string)
    field(:age, :integer)
    field(:is_active, :boolean, default: true, source: :isActive)
    field(:role, Ecto.Enum, values: [:ADMIN, :MEMBER, :GUEST])
    has_one(:profile, DBSchema.Profile, foreign_key: :user_id)
    has_many(:posts, DBSchema.Post, foreign_key: :author_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end