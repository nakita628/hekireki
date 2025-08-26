defmodule DBSchema.Like do
  use Ecto.Schema
  @primary_key false
  schema "like" do
    field(:id, :binary_id, primary_key: true)
    field(:userId, :string)
    field(:postId, :string)
    field(:createdAt, :utc_datetime)
  end
end