# frozen_string_literal: true

# The generated models against the real Active Record, on the SQLite database `prisma db push`
# made from schema.prisma. Everything the generator writes into a model is used here, not only
# loaded: the validations fail and pass, the associations load and destroy, the enums and defaults
# read back, the translations answer. It starts with what three issues reported on schemas like
# this one. Each check raises with what it saw instead.
require "active_record"

ActiveRecord::Base.establish_connection(adapter: "sqlite3", database: File.expand_path("dev.db", __dir__))
# A Rails application turns this on in its framework defaults (5.0 and later); outside one it
# is off, and a belongs_to would take a missing owner.
ActiveRecord::Base.belongs_to_required_by_default = true

# app/models is loaded as a Rails application loads it, by Zeitwerk, which also holds each file to
# the constant its name says (prisma_date_time.rb to PrismaDateTime).
require "zeitwerk"
loader = Zeitwerk::Loader.new
loader.push_dir(File.expand_path("app/models", __dir__))
loader.setup
loader.eager_load

# The checks below make rows; from empty tables each time, so the check can be run again.
ActiveRecord::Base.connection.execute('DELETE FROM "_CategoryToPost"')
[Session, PostTag, Comment, Post, Tag, Category, Profile, User].each(&:delete_all)

I18n.load_path += Dir[File.expand_path("config/locales/**/*.yml", __dir__)]
I18n.available_locales = %i[en ja]

def check(name)
  problem = yield
  raise "#{name}: #{problem}" if problem

  puts "ok: #{name}"
end

def ja(&)
  I18n.with_locale(:ja, &)
end

def user!(address, **attributes)
  User.create!(email_address: address, password: "secret", **attributes)
end

# --- The three issues -------------------------------------------------------------------------

# has_secure_password reports a blank password once, on `password`; the NOT NULL digest column
# gets no `presence` of its own.
check "a blank password is one error, on password" do
  user = User.new(email_address: "a@example.com", password: "")
  user.valid?
  details = user.errors.details
  "expected { password: [{ error: :blank }] }, got #{details.inspect}" unless details == { password: [{ error: :blank }] }
end

check "a password saves and authenticates, the address normalised" do
  user = user!(" Alice@Example.com ")
  reasons = []
  reasons << "email_address #{user.email_address.inspect}" unless user.email_address == "alice@example.com"
  reasons << "authenticate failed" unless user.authenticate("secret")
  reasons << "wrong password accepted" if user.authenticate("wrong")
  reasons.empty? ? nil : reasons.join(", ")
end

# A missing belongs_to is reported on the association, whose @ar.name on the relation field
# translates it; the foreign key's @ar.name is the column's.
check "a missing belongs_to names the association in the schema's words" do
  session = Session.new
  session.valid?
  details = session.errors.details
  next "expected { user: [{ error: :blank }] }, got #{details.inspect}" unless details == { user: [{ error: :blank }] }

  messages = ja { session.errors.full_messages }
  next "expected [\"ユーザーを入力してください\"], got #{messages.inspect}" unless messages == ["ユーザーを入力してください"]

  column = ja { Session.human_attribute_name(:user_id) }
  "expected user_id to be ユーザーID, got #{column.inspect}" unless column == "ユーザーID"
end

# A has_many :through written on the model comes after the has_many it goes through; Active
# Record checks the order the first time the association is used, not when the class loads.
check "has_many :through goes through a generated association, both ways" do
  post = Post.create!(title: "Hello")
  tag = Tag.create!(name: "ruby")
  PostTag.create!(post: post, tag: tag)
  names = Post.find(post.id).tags.map(&:name)
  next "expected [\"ruby\"], got #{names.inspect}" unless names == ["ruby"]

  titles = Tag.find_by!(name: "ruby").posts.map(&:title)
  "expected [\"Hello\"], got #{titles.inspect}" unless titles == ["Hello"]
rescue ActiveRecord::HasManyThroughOrderError => e
  e.message
end

# --- Validations ------------------------------------------------------------------------------

check "the model's names reach I18n" do
  names = ja { [User.model_name.human, User.human_attribute_name(:email_address), Session.model_name.human, Post.model_name.human] }
  "got #{names.inspect}" unless names == %w[ユーザー メールアドレス セッション 記事]
end

check "a translated @ar. message answers for its validator, count and all" do
  post = Post.new(title: "x" * 81, views: -1)
  post.valid?
  messages = ja { post.errors.full_messages }
  expected = ["タイトルは80文字以内で入力してください", "Viewsは0以上で入力してください"]
  next "expected #{expected.inspect}, got #{messages.inspect}" unless messages == expected

  user = User.new(email_address: "not-an-address", password: "secret")
  user.valid?
  messages = ja { user.errors.full_messages_for(:email_address) }
  "expected [\"メールアドレスの形式が正しくありません\"], got #{messages.inspect}" unless messages == ["メールアドレスの形式が正しくありません"]
end

check "presence(false) leaves a NOT NULL column to the model's own callback" do
  user = User.new(email_address: "carol@example.com", password: "secret")
  next "display_name should not be validated: #{user.errors.details.inspect}" if !user.valid? || user.errors.key?(:display_name)

  user.save!
  "expected display_name carol, got #{user.reload.display_name.inspect}" unless user.display_name == "carol"
end

check "a @@unique pair is one error, on the column and not the foreign key" do
  author = user!("dave@example.com")
  post = Post.create!(title: "Slots")
  Comment.create!(body: "first", slot: 1, post: post, user: author)
  again = Comment.new(body: "again", slot: 1, post: post, user: author)
  again.valid?
  errors = again.errors.details.transform_values { |list| list.map { |e| e[:error] } }
  "expected { slot: [:taken] }, got #{errors.inspect}" unless errors == { slot: [:taken] }
end

check "a nullable scope column counts the rows where it is empty apart, as the index does" do
  Category.create!(name: "Food")
  root_again = Category.new(name: "Food")
  next "a second root named Food should be valid: #{root_again.errors.details.inspect}" unless root_again.valid?

  parent = Category.create!(name: "Drink")
  parent.children.create!(name: "Tea")
  sibling = Category.new(name: "Tea", parent: parent)
  sibling.valid?
  errors = sibling.errors.details.transform_values { |list| list.map { |e| e[:error] } }
  next "expected { name: [:taken] }, got #{errors.inspect}" unless errors == { name: [:taken] }

  parent.destroy!
  "children survived their parent" if Category.where(name: "Tea").exists?
end

check "@unique is uniqueness, taken on the second row" do
  user!("erin@example.com")
  other = User.new(email_address: "ERIN@example.com", password: "secret")
  other.valid?
  errors = other.errors.details[:email_address]&.map { |e| e[:error] }
  "expected [:taken], got #{errors.inspect}" unless errors == [:taken]
end

# --- Attributes -------------------------------------------------------------------------------

check "literal defaults are on the record before it is saved" do
  post = Post.new
  values = [post.body, post.views, post.status, post.visibility, User.new.admin]
  expected = ["", 0, "draft", "public", false]
  "expected #{expected.inspect}, got #{values.inspect}" unless values == expected
end

check "an enum validates instead of raising, stores the @map value and takes a prefix where Ruby has the name" do
  post = Post.new(title: "Enum", status: "bogus")
  next "expected an error on status, got #{post.errors.details.inspect}" if post.valid? || !post.errors.key?(:status)

  post = Post.create!(title: "Enum", status: :published, visibility: :private)
  reasons = []
  reasons << "published? false" unless post.published?
  reasons << "visibility_private? false" unless post.visibility_private?
  reasons << "Post.published missed it" unless Post.published.exists?(post.id)
  stored = Post.connection.select_rows("SELECT status, visibility FROM posts WHERE id = #{post.id}").first
  reasons << "stored #{stored.inspect}" unless stored == %w[PUBLISHED private]
  post.update!(visibility: :unlisted)
  stored = Post.connection.select_value("SELECT visibility FROM posts WHERE id = #{post.id}")
  reasons << "unlisted stored as #{stored.inspect}" unless stored == "UNLISTED"
  reasons.empty? ? nil : reasons.join(", ")
rescue ArgumentError => e
  "ArgumentError on assignment: #{e.message}"
end

check "a column named type is a plain column" do
  post = Post.create!(title: "Typed", type: "Article")
  found = Post.find(post.id)
  "expected a Post with type Article, got #{found.class} #{found.type.inspect}" unless found.instance_of?(Post) && found.type == "Article"
end

check "Prisma-named timestamps are filled, bumped and ordered by through their aliases" do
  first = Post.create!(title: "Older")
  second = Post.create!(title: "Newer")
  reasons = []
  reasons << "createdAt not set" if first.createdAt.nil? || first.created_at != first.createdAt
  was = first.updatedAt
  first.update!(title: "Older, edited")
  reasons << "updatedAt not bumped" unless first.updatedAt > was
  first.touch
  reasons << "touch did not bump" unless first.reload.updatedAt > was
  Post.where(id: first.id).update_all(createdAt: 1.day.ago)
  reasons << "recent scope order" unless Post.recent.first == second && Post.recent.last == first
  reasons.empty? ? nil : reasons.join(", ")
end

check "a DateTime is written as the text Prisma writes, and found again by its instant" do
  at = Time.utc(2030, 1, 2, 3, 4, Rational("5.678"))
  post = Post.create!(title: "Dated", createdAt: at)
  stored = Post.connection.select_value(Post.where(id: post.id).select(:createdAt).to_sql)
  if stored != "2030-01-02T03:04:05.678+00:00"
    "stored #{stored.inspect}, Prisma writes 2030-01-02T03:04:05.678+00:00"
  elsif Post.find_by(createdAt: at) != post
    "find_by(createdAt:) missed the row"
  end
end

check "a uuid primary key is made in Ruby and first/last order by created_at" do
  older = Tag.create!(name: "older", created_at: 2.days.ago)
  newer = Tag.create!(name: "newer", created_at: 1.day.ago)
  reasons = []
  reasons << "id #{older.id.inspect}" unless older.id.match?(/\A\h{8}-\h{4}-4\h{3}-[89ab]\h{3}-\h{12}\z/)
  reasons << "implicit_order_column #{Tag.implicit_order_column.inspect}" unless Tag.implicit_order_column == "created_at"
  # "ruby" was created above, now: the newest, whatever its id sorts as.
  reasons << "first is #{Tag.first.name}" unless Tag.first == older
  reasons << "last is #{Tag.last.name}" unless Tag.last.name == "ruby" && newer.created_at < Tag.last.created_at
  reasons.empty? ? nil : reasons.join(", ")
end

# --- Associations -----------------------------------------------------------------------------

check "a has_one is built from its owner and destroyed with it" do
  user = user!("frank@example.com")
  user.create_profile!(bio: "Hi")
  profile = Profile.find_by(user_id: user.id)
  next "profile not saved" if profile.nil?

  long = Profile.new(user: user, bio: "x" * 141)
  long.valid?
  message = ja { long.errors.full_messages_for(:bio) }
  next "expected [\"自己紹介は140文字以内で入力してください\"], got #{message.inspect}" unless message == ["自己紹介は140文字以内で入力してください"]

  user.destroy!
  "profile survived its user" if Profile.exists?(profile.id)
end

check "onDelete: SetNull nullifies, and an optional belongs_to may be empty" do
  author = user!("grace@example.com")
  post = Post.create!(title: "Signed", author: author)
  orphan = Post.create!(title: "Unsigned")
  next "unsigned post should be valid" unless orphan.persisted? && orphan.author.nil?

  author.destroy!
  "expected author_id nil, got #{post.reload.author_id.inspect}" unless post.reload.author_id.nil? && Post.exists?(post.id)
end

check "onDelete: Restrict refuses to destroy an owner with children, as an error" do
  author = user!("heidi@example.com")
  post = Post.create!(title: "Commented")
  Comment.create!(body: "keep me", slot: 9, post: post, user: author)
  destroyed = author.destroy
  reasons = []
  reasons << "destroy returned #{destroyed.inspect}" if destroyed
  reasons << "no error on base: #{author.errors.details.inspect}" unless author.errors.details[:base]&.any? { |e| e[:error] == :"restrict_dependent_destroy.has_many" }
  reasons << "author gone" unless User.exists?(author.id)
  reasons.empty? ? nil : reasons.join(", ")
end

check "onDelete: Cascade destroys the children with their owner" do
  author = user!("ivan@example.com")
  post = Post.create!(title: "Gone", author: author)
  comment = Comment.create!(body: "with it", slot: 1, post: post, user: author)
  PostTag.create!(post: post, tag: Tag.find_by!(name: "ruby"))
  post.destroy!
  "children left: comments #{Comment.exists?(comment.id)}, post_tags #{PostTag.where(post_id: post.id).count}" if Comment.exists?(comment.id) || PostTag.where(post_id: post.id).exists?
end

check "a self relation nullifies the replies of a destroyed parent" do
  author = user!("judy@example.com")
  post = Post.create!(title: "Thread")
  parent = Comment.create!(body: "parent", slot: 1, post: post, user: author)
  reply = Comment.create!(body: "reply", slot: 2, post: post, user: author, parent: parent)
  next "parent.replies missed it" unless parent.replies.include?(reply) && reply.parent == parent

  parent.destroy!
  "expected parent_id nil, got #{reply.reload.parent_id.inspect}" unless reply.reload.parent_id.nil?
end

check "an implicit many-to-many goes through Prisma's join table both ways" do
  post = Post.create!(title: "Filed")
  category = Category.create!(name: "news")
  post.categories << category
  reasons = []
  reasons << "category.posts #{category.posts.map(&:title).inspect}" unless category.posts.reload.map(&:title) == ["Filed"]
  reasons << "post.categories #{post.categories.map(&:name).inspect}" unless Post.find(post.id).categories.map(&:name) == ["news"]
  rows = Post.connection.select_rows("SELECT \"A\", \"B\" FROM \"_CategoryToPost\" WHERE \"B\" = #{post.id}")
  reasons << "join rows #{rows.inspect}" unless rows == [[category.id, post.id]]
  reasons.empty? ? nil : reasons.join(", ")
end

check "a composite primary key finds and destroys one row" do
  post = Post.create!(title: "Keyed")
  tag = Tag.create!(name: "keyed")
  PostTag.create!(post: post, tag: tag)
  row = PostTag.find([post.id, tag.id])
  row.destroy!
  "row survived" if PostTag.where(post_id: post.id, tag_id: tag.id).exists?
end

check "a session is destroyed with its user" do
  user = user!("bob@example.com")
  user.sessions.create!(ip_address: "127.0.0.1")
  user.destroy!
  "expected no session left, #{Session.where(user_id: user.id).count} found" if Session.where(user_id: user.id).exists?
end
