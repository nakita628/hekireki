class User < ApplicationRecord
  attribute :id, default: -> { SecureRandom.uuid_v7 }
  attribute :interests, default: -> { [] }

  enum :role, { admin: "ADMIN", editor: "EDITOR", viewer: "VIEWER" }, default: :viewer, validate: true

  validates :email, presence: true, uniqueness: true
  validates :name, presence: true

  has_one :profile, dependent: :destroy
  has_many :posts, foreign_key: "author_id", inverse_of: :author, dependent: :destroy
  has_many :comments, foreign_key: "author_id", inverse_of: :author, dependent: :nullify
  has_many :orders, dependent: :restrict_with_error
  has_many :followers, class_name: "Follow", foreign_key: "following_id", inverse_of: :following, dependent: :destroy
  has_many :following, class_name: "Follow", foreign_key: "follower_id", inverse_of: :follower, dependent: :destroy
end
