defmodule MyApp.Comment do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  schema "Comment" do
    field(:body, :string)
    field(:createdAt, :naive_datetime)
    field(:updatedAt, :naive_datetime)
    field(:userId, :string)
    field(:postId, :string)
    field(:user, :string)
    field(:post, :string)
  end
end
