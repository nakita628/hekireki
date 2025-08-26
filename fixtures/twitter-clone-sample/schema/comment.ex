defmodule DBSchema.Comment do
  use Ecto.Schema
  @primary_key false
  schema "comment" do
    field(:id, :binary_id, primary_key: true)
    field(:body, :string)
    field(:createdAt, :utc_datetime)
    field(:updatedAt, :utc_datetime)
    field(:userId, :string)
    field(:postId, :string)
  end
end