defmodule Example.Actor do
  @moduledoc """
  Named implicit many-to-many: the join table is `_cast`,
  not `_ActorToFilm`.
  """

  use Ecto.Schema

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          name: String.t(),
          films: [Example.Film.t()]
        }

  schema "Actor" do
    field(:name, :string)
    many_to_many(:films, Example.Film, join_through: "_cast", join_keys: [A: :id, B: :id])
  end
end