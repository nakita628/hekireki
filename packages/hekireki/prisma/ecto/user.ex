defmodule MyApp.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "User" do
    field(:name, :string)
    field(:username, :string)
    field(:bio, :string)
    field(:email, :string)
    field(:emailVerified, :naive_datetime)
    field(:image, :string)
    field(:coverImage, :string)
    field(:profileImage, :string)
    field(:hashedPassword, :string)
    field(:createdAt, :naive_datetime)
    field(:updatedAt, :naive_datetime)
    field(:hasNotification, :boolean)
    field(:posts, :string)
    field(:comments, :string)
    field(:notifications, :string)
    field(:followers, :string)
    field(:following, :string)
    field(:likes, :string)
  end
end
