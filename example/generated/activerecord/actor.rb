# Named implicit many-to-many: the join table is `_cast`,
# not `_ActorToFilm`.
class Actor < ApplicationRecord
  self.table_name = "actor"

  has_and_belongs_to_many :films, class_name: "Film", join_table: "_cast", foreign_key: "A", association_foreign_key: "B"
end