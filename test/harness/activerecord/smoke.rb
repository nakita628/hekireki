# frozen_string_literal: true

# Loads every generated model against the real Active Record API — what
# `ruby -c` cannot see: an association whose class_name resolves to nothing,
# an enum mapping the DSL rejects, a composite primary key assignment the
# running Active Record version does not support. No database connection is
# needed: table_name/primary_key assignment, enum definition, and association
# reflection all run at class-definition time.
require "active_record"

# application_record.rb is generated too (the output directory is a `models`
# directory); Zeitwerk would resolve it on demand, here it loads first.
models_dir = File.expand_path("models", __dir__)
base = File.join(models_dir, "application_record.rb")
raise "application_record.rb expected in #{models_dir}" unless File.exist?(base)
require base
model_files = (Dir[File.join(models_dir, "*.rb")] - [base]).sort
raise "no generated models found in #{models_dir}" if model_files.empty?

model_files.each { |file| require file }
raise "ApplicationRecord is not the primary abstract class" unless ActiveRecord.application_record_class == ApplicationRecord

models = ApplicationRecord.descendants
raise "model files loaded but no ApplicationRecord subclasses defined" if models.empty?

associations = models.sum do |model|
  model.reflect_on_all_associations.each do |association|
    association.klass
    # Every generated association names its inverse: Rails 7.2 never infers
    # one for an association given foreign_key:, so without inverse_of a
    # record built through the collection does not see its owner in memory.
    next if association.macro == :has_and_belongs_to_many

    inverse = association.inverse_of
    raise "#{model}.#{association.name} has no inverse" if inverse.nil?
  end
  model.defined_enums
  model.reflect_on_all_associations.size
end

# Composite-FK reflection (Rails 7.2 array form) and enum @map values are the
# corners a bare klass resolution cannot see. `public` and `private` are
# Module methods, so this enum's keys carry the attribute prefix.
stock_fk = Array(Stock.reflect_on_association(:warehouse).foreign_key).map(&:to_s)
raise "composite foreign_key expected, got #{stock_fk.inspect}" unless stock_fk == %w[country code]

visibility = Board.defined_enums.fetch("visibility")
expected = { "public" => "public", "private" => "private", "link_only" => "link_only" }
raise "enum @map values expected, got #{visibility.inspect}" unless visibility == expected
raise "prefixed predicate expected" unless Board.method_defined?(:visibility_public?)
raise "unprefixed predicate expected" unless Account.method_defined?(:active?)

# An association whose names follow Rails' conventions is written without
# options, so the inverse below comes from Rails' own inference.
posts = Account.reflect_on_association(:posts)
raise "explicit options expected on posts" unless posts.options.key?(:foreign_key)

# dependent: follows each foreign key's ON DELETE; an enum validates instead
# of raising on assignment.
actions = RefActionParent.reflect_on_all_associations.to_h { |a| [a.name, a.options[:dependent]] }
expected = { cascades: :destroy, nulls: :nullify, restricts: :restrict_with_error, noacts: :restrict_with_error, defaults: nil }
raise "dependent options expected, got #{actions.inspect}" unless actions == expected
raise "enum validate expected" unless Board.validators_on(:visibility).any? { |v| v.kind == :inclusion }

# `/// @ar.` calls reach the model: a field's options join its validation, a
# model's line is written as it is, and a translated message goes to
# config/locales instead of the model, under the key Rails reads for it.
raise "@ar. field option expected" unless Open.validators_on(:contact).any? { |v| v.kind == :format && !v.options.key?(:message) }
raise "@ar. model line expected" unless Open.validators_on(:name).any? { |v| v.kind == :presence && v.options[:on] == :create }
I18n.load_path += Dir[File.expand_path("config/locales/*.yml", __dir__)]
I18n.available_locales = %i[en ja]
I18n.with_locale(:ja) do
  raise "model name" unless Open.model_name.human == "公開情報"
  raise "attribute name" unless Open.human_attribute_name(:name) == "名前"
  too_long = I18n.t("activerecord.errors.models.open.attributes.name.too_long", count: 40)
  raise "translated too_long, got #{too_long.inspect}" unless too_long == "40文字以内で入力してください"
  invalid = I18n.t("activerecord.errors.models.open.attributes.contact.invalid")
  raise "translated format, got #{invalid.inspect}" unless invalid == "の形式が正しくありません"
end
I18n.with_locale(:en) do
  raise "english format" unless I18n.t("activerecord.errors.models.open.attributes.contact.invalid") == "is not an email address"
  # Plural forms: I18n picks `one` or `other` by count, for a message and a model name.
  one = I18n.t("activerecord.errors.models.open.attributes.name.too_long", count: 1)
  many = I18n.t("activerecord.errors.models.open.attributes.name.too_long", count: 40)
  raise "plural too_long, got #{[one, many].inspect}" unless one == "is too long (maximum is 1 character)" && many == "is too long (maximum is 40 characters)"
  raise "plural model name" unless Open.model_name.human == "Open record" && Open.model_name.human(count: 2) == "Open records"
end

# Prisma-named timestamp columns reach Rails' timestamp machinery through
# attribute aliases, which is what timestamp_attributes_for_update reads.
aliases = Ticket.attribute_aliases
expected = { "created_at" => "createdAt", "updated_at" => "updatedAt" }
raise "timestamp aliases expected, got #{aliases.inspect}" unless aliases == expected
raise "Profile maps updated_at itself, no alias expected" unless Profile.attribute_aliases.empty?

puts "ok: #{models.size} models, #{associations} associations resolved"
