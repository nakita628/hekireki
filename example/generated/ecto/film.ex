defmodule Example.Film do
  use Ecto.Schema
  @moduledoc false

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          title: String.t(),
          actors: [Example.Actor.t()]
        }

  schema "film" do
    field(:title, :string)
    many_to_many(:actors, Example.Actor, join_through: "_cast", join_keys: [B: :id, A: :id])
  end
end