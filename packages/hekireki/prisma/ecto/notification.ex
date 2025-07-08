defmodule MyApp.Notification do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "Notification" do
    field(:body, :string)
    field(:userId, :string)
    field(:createdAt, :naive_datetime)
    field(:user, :string)
  end
end
