# Implicit many-to-many partner of Post (join table `_PostToTag`).
class Tag < ApplicationRecord
  self.table_name = "tag"

  has_and_belongs_to_many :posts, class_name: "Post", join_table: "_PostToTag", foreign_key: "B", association_foreign_key: "A"
end