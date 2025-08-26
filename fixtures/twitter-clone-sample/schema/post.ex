defmodule DBSchema.Post do
  use Ecto.Schema
  @primary_key false
  schema "post" do
    field(:id, :binary_id, primary_key: true)
    field(:body, :string)
    field(:createdAt, :utc_datetime)
    field(:updatedAt, :utc_datetime)
    field(:userId, :string)
  end
end