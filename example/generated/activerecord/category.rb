# Self-relation (adjacency-list tree) with a composite unique.
class Category < ApplicationRecord
  self.table_name = "Category"

  validates :name, presence: true, uniqueness: { scope: :parent_id, conditions: -> { where.not(parent_id: nil) } }

  belongs_to :parent, class_name: "Category", optional: true, inverse_of: :children
  has_many :children, class_name: "Category", foreign_key: "parent_id", inverse_of: :parent, dependent: :nullify
end
