defmodule MyApp.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "Post" do
    field(:body, :string)
    field(:createdAt, :naive_datetime)
    field(:updatedAt, :naive_datetime)
    field(:userId, :string)
    field(:user, :string)
    field(:comments, :string)
    field(:likes, :string)
  end
end
