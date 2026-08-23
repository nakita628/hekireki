defmodule Example.Actor do
  use Ecto.Schema
  @moduledoc """
  Named implicit many-to-many: the join table is `_cast`,
  not `_ActorToFilm`.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          films: [Example.Film.t()]
        }

  schema "actor" do
    field(:name, :string)
    many_to_many(:films, Example.Film, join_through: "_cast", join_keys: [A: :id, B: :id])
  end
end