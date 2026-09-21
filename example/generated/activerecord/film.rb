class Film < ApplicationRecord
  self.table_name = "Film"

  validates :title, presence: true

  has_and_belongs_to_many :actors, join_table: "_cast", foreign_key: "B", association_foreign_key: "A"
end
