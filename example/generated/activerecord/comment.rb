# Two foreign keys with different referential actions
# (Cascade vs SetNull) and a composite index.
class Comment < ApplicationRecord
  self.table_name = "comments"

  belongs_to :post, class_name: "Post", foreign_key: "post_id"
  belongs_to :author, class_name: "User", foreign_key: "author_id", optional: true
end