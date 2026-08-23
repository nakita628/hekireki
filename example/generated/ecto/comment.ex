defmodule Example.Comment do
  use Ecto.Schema
  @moduledoc """
  Two foreign keys with different referential actions
  (Cascade vs SetNull) and a composite index.
  """

  @primary_key {:id, :id, autogenerate: true}

  @type t :: %__MODULE__{
          id: integer(),
          body: String.t(),
          post: Example.Post.t() | nil,
          author: Example.User.t() | nil
        }

  schema "comments" do
    field(:body, :string)
    belongs_to(:post, Example.Post, foreign_key: :post_id, type: :binary_id)
    belongs_to(:author, Example.User, foreign_key: :author_id, type: :binary_id)
    timestamps(type: :utc_datetime, inserted_at_source: :created_at, updated_at: false)
  end
end