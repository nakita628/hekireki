# Application user. Fully annotated for every validator generator,
# with a UUIDv7 primary key, enum default, scalar list, @map columns,
# @updatedAt, and relations of every cardinality.
class User < ApplicationRecord
  self.table_name = "users"

  attribute :id, default: -> { SecureRandom.uuid_v7 }

  enum :role, { ADMIN: "ADMIN", EDITOR: "EDITOR", VIEWER: "VIEWER" }

  has_one :profile, class_name: "Profile", foreign_key: "user_id"
  has_many :posts, class_name: "Post", foreign_key: "author_id"
  has_many :comments, class_name: "Comment", foreign_key: "author_id"
  has_many :orders, class_name: "Order", foreign_key: "user_id"
  has_many :followers, class_name: "Follow", foreign_key: "following_id"
  has_many :following, class_name: "Follow", foreign_key: "follower_id"
end