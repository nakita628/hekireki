class User < ApplicationRecord
  attribute :admin, default: false

  validates :email_address, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }

  has_one :profile, dependent: :destroy
  has_many :sessions, dependent: :destroy
  has_many :posts, foreign_key: "author_id", inverse_of: :author, dependent: :nullify
  has_many :comments, dependent: :restrict_with_error

  has_secure_password
  normalizes :email_address, with: ->(e) { e.strip.downcase }
  before_validation { self.display_name = email_address.to_s.split("@").first if display_name.blank? }
end
