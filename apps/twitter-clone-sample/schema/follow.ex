defmodule DBSchema.Follow do
  use Ecto.Schema
  @primary_key false
  schema "follow" do
    field(:id, :binary_id, primary_key: true)
    field(:followerId, :string)
    field(:followingId, :string)
    field(:createdAt, :utc_datetime)
  end
end