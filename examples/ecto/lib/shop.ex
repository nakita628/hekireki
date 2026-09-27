defmodule Shop.Repo do
  use Ecto.Repo, otp_app: :shop, adapter: Ecto.Adapters.SQLite3
end

defmodule Shop.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    Supervisor.start_link([Shop.Repo], strategy: :one_for_one, name: Shop.Supervisor)
  end
end
