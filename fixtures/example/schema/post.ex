defmodule DBSchema.Post do
  use Ecto.Schema
  @primary_key false
  schema "post" do
    field(:id, :binary_id, primary_key: true)
    field(:title, :string)
    field(:content, :string)
    field(:userId, :string)
  end
end