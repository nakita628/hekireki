defmodule MyApp.Like do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "Like" do
    field(:userId, :string)
    field(:postId, :string)
    field(:createdAt, :naive_datetime)
    field(:user, :string)
    field(:post, :string)
  end
end
