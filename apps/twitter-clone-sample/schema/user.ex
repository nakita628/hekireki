defmodule DBSchema.User do
  use Ecto.Schema
  @primary_key false
  schema "user" do
    field(:id, :binary_id, primary_key: true)
    field(:name, :string)
    field(:username, :string)
    field(:bio, :string)
    field(:email, :string)
    field(:emailVerified, :utc_datetime)
    field(:image, :string)
    field(:coverImage, :string)
    field(:profileImage, :string)
    field(:hashedPassword, :string)
    field(:createdAt, :utc_datetime)
    field(:updatedAt, :utc_datetime)
    field(:hasNotification, :boolean)
  end
end