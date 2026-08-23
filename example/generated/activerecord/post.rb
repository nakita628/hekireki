# @@map + @map column names, FK with a referential action,
# mapped-enum default, and an implicit many-to-many to Tag.
class Post < ApplicationRecord
  self.table_name = "posts"

  attribute :id, default: -> { SecureRandom.uuid }

  enum :visibility, { PUBLIC: "public", PRIVATE: "private", LINK_ONLY: "link_only" }

  belongs_to :author, class_name: "User", foreign_key: "author_id"
  has_many :comments, class_name: "Comment", foreign_key: "post_id"
  has_and_belongs_to_many :tags, class_name: "Tag", join_table: "_PostToTag", foreign_key: "A", association_foreign_key: "B"
end