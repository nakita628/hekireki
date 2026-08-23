class Film < ApplicationRecord
  self.table_name = "film"

  has_and_belongs_to_many :actors, class_name: "Actor", join_table: "_cast", foreign_key: "B", association_foreign_key: "A"
end