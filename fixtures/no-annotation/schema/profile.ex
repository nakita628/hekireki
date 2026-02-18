defmodule DBSchema.Profile do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          bio: String.t(),
          avatar: String.t(),
          userId: String.t()
        }

  schema "profile" do
    field(:bio, :string)
    field(:avatar, :string)
    field(:userId, :string)
  end
end