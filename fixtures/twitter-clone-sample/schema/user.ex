defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          username: String.t(),
          bio: String.t(),
          email: String.t(),
          emailVerified: DateTime.t(),
          image: String.t(),
          coverImage: String.t(),
          profileImage: String.t(),
          hashedPassword: String.t(),
          hasNotification: boolean()
        }

  schema "user" do
    field(:name, :string)
    field(:username, :string)
    field(:bio, :string, default: "")
    field(:email, :string)
    field(:emailVerified, :utc_datetime)
    field(:image, :string)
    field(:coverImage, :string)
    field(:profileImage, :string)
    field(:hashedPassword, :string)
    field(:hasNotification, :boolean, default: false)
    timestamps(inserted_at: :createdAt, updated_at: :updatedAt)
  end
end