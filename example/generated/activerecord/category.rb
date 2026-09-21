class Category < ApplicationRecord
  self.table_name = "Category"

  validates :name, presence: true
  validates :parent_id, uniqueness: { scope: :name, allow_nil: true }

  belongs_to :parent, class_name: "Category", optional: true, inverse_of: :children
  has_many :children, class_name: "Category", foreign_key: "parent_id", inverse_of: :parent, dependent: :nullify
end
