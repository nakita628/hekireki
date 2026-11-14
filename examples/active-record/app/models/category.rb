# An implicit many-to-many: Prisma's own join table, _CategoryToPost with columns A and B. A
# tree as well: a name is unique among the children of one parent, and the index counts the
# roots apart (NULL is distinct), so two roots may share a name.
class Category < ApplicationRecord
  validates :name, presence: true, uniqueness: { scope: :parent_id, conditions: -> { where.not(parent_id: nil) } }

  belongs_to :parent, class_name: "Category", optional: true, inverse_of: :children
  has_many :children, class_name: "Category", foreign_key: "parent_id", inverse_of: :parent, dependent: :destroy
  has_and_belongs_to_many :posts, join_table: "_CategoryToPost", foreign_key: "A", association_foreign_key: "B"
end
