# A person who signs in. has_secure_password reads and writes password_digest and reports a
# blank password on `password`, so the column gets no `presence` of its own.
#
# display_name:: NOT NULL, but filled from the address before validation when left empty: the presence the
#   schema implies is taken away.
class User < ApplicationRecord
  attribute :admin, default: false
  attribute :created_at, PrismaDateTime.new, default: -> { Time.current }
  attribute :updated_at, PrismaDateTime.new

  validates :email_address, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }

  has_one :profile, dependent: :destroy
  has_many :sessions, dependent: :destroy
  has_many :posts, foreign_key: "author_id", inverse_of: :author, dependent: :nullify
  has_many :comments, dependent: :restrict_with_error

  has_secure_password
  normalizes :email_address, with: ->(e) { e.strip.downcase }
  before_validation { self.display_name = email_address.to_s.split("@").first if display_name.blank? }
end
