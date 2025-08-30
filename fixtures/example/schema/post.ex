defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          userId: String.t()
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    field(:userId, :string)
  end
end