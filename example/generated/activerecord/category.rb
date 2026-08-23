# Self-relation (adjacency-list tree) with a composite unique.
class Category < ApplicationRecord
  self.table_name = "category"

  belongs_to :parent, class_name: "Category", foreign_key: "parent_id", optional: true
  has_many :children, class_name: "Category", foreign_key: "parent_id"
end