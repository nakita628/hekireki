class Post < ApplicationRecord
  self.implicit_order_column = "created_at"

  attribute :id, default: -> { SecureRandom.uuid }
  attribute :published, default: false
  attribute :view_count, default: 0

  enum :visibility, { public: "public", private: "private", link_only: "link_only" }, default: :link_only, prefix: true,
                                                                                      validate: true

  validates :title, presence: true

  belongs_to :author, class_name: "User", inverse_of: :posts
  has_many :comments, dependent: :destroy
  has_and_belongs_to_many :tags, join_table: "_PostToTag", foreign_key: "A", association_foreign_key: "B"
end
