# Two foreign keys with different referential actions
# (Cascade vs SetNull) and a composite index.
class Comment < ApplicationRecord
  validates :body, presence: true

  belongs_to :post, inverse_of: :comments
  belongs_to :author, class_name: "User", optional: true, inverse_of: :comments
end
