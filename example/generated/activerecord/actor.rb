# Named implicit many-to-many: the join table is `_cast`,
# not `_ActorToFilm`.
class Actor < ApplicationRecord
  self.table_name = "Actor"

  validates :name, presence: true

  has_and_belongs_to_many :films, join_table: "_cast", foreign_key: "A", association_foreign_key: "B"
end
