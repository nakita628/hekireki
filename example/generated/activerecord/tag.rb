class Tag < ApplicationRecord
  self.table_name = "Tag"

  validates :label, presence: true, uniqueness: true

  has_and_belongs_to_many :posts, join_table: "_PostToTag", foreign_key: "B", association_foreign_key: "A"
end
