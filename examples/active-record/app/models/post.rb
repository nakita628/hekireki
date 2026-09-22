class Post < ApplicationRecord
  self.inheritance_column = nil

  attribute :body, default: ""
  attribute :views, default: 0
  alias_attribute :created_at, :createdAt
  alias_attribute :updated_at, :updatedAt

  enum :status, { draft: "DRAFT", published: "PUBLISHED", archived: "ARCHIVED" }, default: :draft, validate: true
  enum :visibility, { public: "public", private: "private", unlisted: "UNLISTED" }, default: :public, prefix: true,
                                                                                    validate: true

  validates :title, presence: true, length: { maximum: 80 }
  validates :views, numericality: { greater_than_or_equal_to: 0 }

  belongs_to :author, class_name: "User", optional: true, inverse_of: :posts
  has_many :post_tags, dependent: :destroy
  has_many :comments, dependent: :destroy
  has_and_belongs_to_many :categories, join_table: "_CategoryToPost", foreign_key: "B", association_foreign_key: "A"

  has_many :tags, through: :post_tags
  scope :recent, -> { order(created_at: :desc) }
end
