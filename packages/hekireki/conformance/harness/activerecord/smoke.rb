# frozen_string_literal: true

# Loads every generated model against the real Active Record API — what
# `ruby -c` cannot see: an association whose class_name resolves to nothing,
# an enum mapping the DSL rejects, a composite primary key assignment the
# running Active Record version does not support. No database connection is
# needed: table_name/primary_key assignment, enum definition, and association
# reflection all run at class-definition time.
require "active_record"

class ApplicationRecord < ActiveRecord::Base
  self.abstract_class = true
end

models_dir = File.expand_path("models", __dir__)
model_files = Dir[File.join(models_dir, "*.rb")].sort
raise "no generated models found in #{models_dir}" if model_files.empty?

model_files.each { |file| require file }

models = ApplicationRecord.descendants
raise "model files loaded but no ApplicationRecord subclasses defined" if models.empty?

associations = models.sum do |model|
  model.reflect_on_all_associations.each do |association|
    association.klass
  end
  model.defined_enums
  model.reflect_on_all_associations.size
end

# Composite-FK reflection (Rails 7.2 array form) and enum @map values are the
# corners a bare klass resolution cannot see.
stock_fk = Array(Stock.reflect_on_association(:warehouse).foreign_key).map(&:to_s)
raise "composite foreign_key expected, got #{stock_fk.inspect}" unless stock_fk == %w[country code]

visibility = Board.defined_enums.fetch("visibility")
expected = { "PUBLIC" => "public", "PRIVATE" => "private", "LINK_ONLY" => "link_only" }
raise "enum @map values expected, got #{visibility.inspect}" unless visibility == expected

puts "ok: #{models.size} models, #{associations} associations resolved"
