defmodule MyApp.User do
  use Ecto.Schema
  @primary_key false
  schema "users" do
    field :id, :binary_id, primary_key: true
    field :name, :string
  end
end