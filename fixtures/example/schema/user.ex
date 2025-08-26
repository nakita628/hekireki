defmodule DBSchema.User do
  use Ecto.Schema
  @primary_key false
  schema "user" do
    field(:id, :binary_id, primary_key: true)
    field(:name, :string)
  end
end