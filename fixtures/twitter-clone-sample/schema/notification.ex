defmodule DBSchema.Notification do
  use Ecto.Schema
  @primary_key false
  schema "notification" do
    field(:id, :binary_id, primary_key: true)
    field(:body, :string)
    field(:userId, :string)
    field(:createdAt, :utc_datetime)
  end
end