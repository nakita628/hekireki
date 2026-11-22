import type { DMMF } from '@prisma/generator-helper'

import { isAnnotationLine, stripAnnotations } from '../annotation/index.js'
import { isSameList } from '../list/index.js'
import { camelize, pluralize, singularize, underscore } from '../naming/active-support.js'
import { makePascalCase, makeSnakeCase } from '../naming/case.js'
import { allocate } from '../naming/index.js'
import type { RelationEnd } from '../prisma/model.js'
import { fieldColumn, primaryKeyFields, referentialActions, relationEnds } from '../prisma/model.js'
import { ACTIVE_RECORD_INSTANCE_METHODS, RUBY_TOP_LEVEL_CONSTANTS } from './activerecord-names.js'

// cspell:disable
// Names an enum key on an Active Record model may not take, nor the plural of
// an enum's name, which Rails makes a class method (`statuses`). Rails defines a
// scope `key` and `not_key` and the predicates `key?` and `key!` for each key:
// it raises for a name Active Record itself defines, and for a scope that
// ActiveRecord::Relation defines other than as Object does (`map`, `each`,
// `to_a`), and, for one Object or Kernel defines, overwrites the method with a
// warning. Made on Active Record 8.1 with the script below, one name per line;
// regenerate it when the harness moves to a new series.
//
//   base = ActiveRecord::Base
//   keys = (base.methods + base.private_methods).map(&:to_s).flat_map { |m| [m, m.delete_prefix("not_")] }
//   rel = ActiveRecord::Relation
//   keys += (rel.instance_methods + rel.private_instance_methods)
//     .reject { |m| (Object.method_defined?(m) || Object.private_method_defined?(m)) && rel.instance_method(m).owner == Object.instance_method(m).owner }
//     .map(&:to_s).flat_map { |m| [m, m.delete_prefix("not_")] }
//   keys += (base.instance_methods + base.private_instance_methods).map(&:to_s)
//     .select { |m| m.end_with?("?", "!") }.map { |m| m.chomp("?").chomp("!") }
//   keys += %w[nil true false self]
//   puts keys.uniq.select { |k| k.match?(/\A[a-z][a-z0-9_]*\z/) && !k.include?("__") }.sort
const RAILS_RESERVED_NAMES: ReadonlySet<string> = new Set(
  `abort
abstract_class
accepts_nested_attributes_for
act_on_ignored_order
acts_like
adapter_class
add_autosave_association_callbacks
add_length_validation_for_encrypted_columns
after_commit
after_create
after_create_commit
after_destroy
after_destroy_commit
after_find
after_initialize
after_rollback
after_save
after_save_commit
after_touch
after_update
after_update_commit
after_validation
aggregate_column
aggregate_reflections
alias_attribute
alias_attribute_method_definition
alias_method
alias_tracker
aliases_by_attribute_name
all
all_timestamp_attributes_in_model
allocate
allow_destroy
ancestors
and
annotate
annotate_values
append_to_connected_to_stack
apply_finish_limit
apply_join_dependency
apply_limits
apply_pending_attribute_modifications
apply_scoping
apply_start_limit
arel
arel_column
arel_column_aliases_from_hash
arel_column_with_table
arel_columns
arel_columns_from_hash
arel_table
around_create
around_destroy
around_save
around_update
as_json
assert_valid_enum_definition_values
assert_valid_enum_options
assert_valid_transaction_action
association_cached
association_foreign_key_changed
association_valid
async
async_average
async_count
async_count_by_sql
async_find_by_sql
async_ids
async_maximum
async_minimum
async_pick
async_pluck
async_sum
asynchronous_queries_session
asynchronous_queries_tracker
at_exit
attached_object
attr
attr_accessor
attr_internal
attr_internal_accessor
attr_internal_define
attr_internal_reader
attr_internal_writer
attr_reader
attr_readonly
attr_writer
attribute
attribute_alias
attribute_aliases
attribute_came_from_user
attribute_changed
attribute_changed_in_place
attribute_method
attribute_method_affix
attribute_method_patterns
attribute_method_patterns_cache
attribute_method_patterns_matching
attribute_method_prefix
attribute_method_suffix
attribute_names
attribute_present
attribute_previously_changed
attribute_types
attribute_will_change
attributes_builder
attributes_for_inspect
authenticate_by
autoload
automatic_scope_inversing
automatically_invert_plural_associations
autosaving_belongs_to_for
average
base_class
batch_condition
batch_on_loaded_relation
batch_on_unloaded_relation
becomes
before_commit
before_committed
before_create
before_destroy
before_save
before_update
before_validation
belongs_to
belongs_to_required_by_default
benchmark
bind_attribute
binding
blank
block_given
build
build_arel
build_batch_orders
build_bound_sql_literal
build_case_for_value_position
build_cast_value
build_column_serializer
build_count_subquery
build_default_constraint
build_default_scope
build_explain_clause
build_from
build_having_clause
build_join_buckets
build_join_dependencies
build_joins
build_mangled_name
build_named_bound_sql_literal
build_order
build_select
build_subquery
build_where_clause
build_with
build_with_expression_from_value
build_with_join_node
build_with_value_from_hash
cache
cache_key
cache_key_with_version
cache_timestamp_format
cache_version
cache_versioning
cached_find_by
cached_find_by_statement
calculate
caller
caller_locations
can_use_fast_cache_version
catch
cattr_accessor
cattr_reader
cattr_writer
chain
changed
changed_for_autosave
check_model_columns
check_record_limit
chunk
chunk_while
class
class_attribute
class_eval
class_exec
class_variable_get
class_variable_set
class_variables
clear_query_caches_for_current_thread
clear_reflections_cache
clone
collect
collect_concat
collecting_queries_for_explain
collection_cache_key
collection_cache_versioning
column_defaults
column_for_attribute
column_names
column_references
columns
columns_hash
combine_signed_id_purposes
committed
compact
compact_blank
compare_values_for_order
composed_of
composite_query_constraints_list
compute_cache_key
compute_cache_version
compute_table_name
compute_type
concern
concerning
configurations
connected_to
connected_to_all_shards
connected_to_many
connected_to_stack
connecting_to
connection
connection_class
connection_class_for_self
connection_db_config
connection_handler
connection_pool
connection_specification_name
connects_to
const_added
const_get
const_missing
const_set
const_source_location
constants
construct_join_dependency
construct_relation_for_exists
content_columns
count
count_by_sql
counter_cached_association_names
create
create_or_find_by
create_with
create_with_value
current_preventing_writes
current_role
current_scope
current_scope_restoring_block
current_shard
current_time_from_proper_timezone
current_transaction
custom_inspect_method_defined
custom_validation_context
cycle
decorate_attributes
decrement
decrement_counter
deep_dup
default_column_serializer
default_connection_handler
default_extensions
default_role
default_scope
default_scope_override
default_scoped
default_scopes
default_shard
define_attribute
define_attribute_method
define_attribute_method_pattern
define_attribute_methods
define_autosave_validation_callbacks
define_call
define_callbacks
define_default_attribute
define_delegated_type_methods
define_method
define_method_attribute
define_model_callbacks
define_non_cyclic_method
define_proxy_call
define_singleton_method
defined_enums
delegate
delegate_missing_to
delegated_type
delete
delete_all
delete_by
deprecate
deprecate_constant
descendants
destroy
destroy_all
destroy_association_async_batch_size
destroy_association_async_job
destroy_by
destroyed
detect
deterministic_encrypted_attributes
discriminate_class_for_record
display
distinct
distinct_value
drop
drop_while
dup
duplicable
each
each_cons
each_entry
each_join_dependencies
each_slice
each_with_index
each_with_object
eager_load
eager_load_values
eagerly_generate_alias_attribute_methods
encode_with
encrypt_attribute
encrypted_attribute
encrypted_attributes
encrypts
entries
enum
enum_for
enumerate_columns_in_select_statements
eql
equal
establish_connection
eval
evaluate_default_scope
except
excluding
exec
exec_explain
exec_main_query
exec_queries
execute_grouped_calculation
execute_simple_calculation
exit
explain
extend
extended
extending
extending_values
extensions
extract_associated
extract_table_name_from
fail
false
fifth
filter
filter_attributes
filter_map
find
find_all
find_by
find_by_sql
find_by_token_for
find_each
find_in_batches
find_index
find_last
find_nth
find_nth_from_last
find_nth_with_limit
find_one
find_or_create_by
find_or_initialize_by
find_signed
find_sole_by
find_some
find_some_ordered
find_sti_class
find_take
find_take_with_limit
find_with_ids
first
first_or_create
first_or_initialize
flat_map
flattened_args
fork
format
forty_two
fourth
freeze
from
from_clause
frozen
full_table_name_prefix
full_table_name_suffix
gem
gem_original_require
generate_alias_attribute_methods
generate_alias_attributes
generate_association_writer
generate_relation_method
generate_unique_secure_token
generated_association_methods
generated_attribute_methods
generated_relation_methods
generated_token_verifier
generates_token_for
get_callbacks
get_primary_key
gets
global_current_scope
global_previous_schemes_for
global_variables
grep
grep_v
group
group_by
group_values
has_and_belongs_to_many
has_attribute
has_changes_to_save
has_defer_touch_attrs
has_destroy_flag
has_encrypted_attributes
has_many
has_many_inversing
has_one
has_secure_password
has_secure_token
has_transactional_callbacks
hash
having
having_clause
hook_attribute_type
human_attribute_name
i18n_scope
id
ids
ignored_columns
immutable_strings_by_default
implicit_order_column
in
in_batches
in_groups
in_groups_of
in_order_of
include
include_relation_methods
include_root_in_json
included
included_modules
includes
includes_values
including
increment
increment_counter
index
index_by
index_with
inheritance_column
inherited
initialize
initialize_clone
initialize_copy
initialize_dup
initialize_find_by_cache
initialize_generated_modules
initialize_load_schema_monitor
initialize_relation_delegate_cache
inject
insert
insert_all
inspect
inspection_filter
instance_eval
instance_exec
instance_method
instance_methods
instance_of
instance_values
instance_variable_defined
instance_variable_get
instance_variable_names
instance_variable_set
instance_variables
instance_variables_to_inspect
instantiate
instantiate_instance_of
instantiate_records
internal_metadata_table_name
invalid
inverse_polymorphic_association_changed
invert_where
is_a
iterator
itself
j
jj
join
joined_includes_values
joins
joins_values
kind_of
klass
lambda
last
lazy
lease_connection
left_joins
left_outer_joins
left_outer_joins_values
length
limit
limit_value
limited_count
load
load_async
load_records
load_schema
loaded
local_stored_attributes
local_variables
lock
lock_optimistically
lock_value
locking_column
locking_enabled
logger
lookup_ancestors
lookup_cast_type_from_join_dependencies
lookup_table_klass_from_join_dependencies
loop
map
marked_for_destruction
mattr_accessor
mattr_reader
mattr_writer
max
max_by
maximum
merge
method
method_added
method_missing
method_removed
method_undefined
method_visibility
methods
min
min_by
minimum
minmax
minmax_by
model
model_name
module_eval
module_exec
module_parent
module_parent_name
module_parents
name
nested_attributes_options
nested_records_changed_for_autosave
new
new_record
next_sequence_value
nil
no_touching
no_warning_require
none
normalize_callback_params
normalize_value_for
normalized_attributes
normalized_reflections
normalizes
object_id
offset
offset_value
only
only_columns
open
operation_over_aggregate_column
optimizer_hints
optimizer_hints_values
or
order
order_column
order_values
ordered_relation
override_accessors_to_preserve_original
p
param_delimiter
partial_inserts
partial_updates
partition
pending_attribute_modifications
perform_calculation
persisted
pick
pk_attribute
pluck
pluralize_table_names
polymorphic_class_for
polymorphic_name
pool_transaction_isolation_level
pp
predicate_builder
predicate_for_validation_context
preload
preload_associations
preload_values
prepend
prepend_option
prepended
preprocess_order_args
presence
presence_in
present
preserve_original_encrypted
pretty_print
previously_new_record
previously_persisted
primary_abstract_class
primary_key
primary_key_prefix_type
primary_key_values_present
print
printf
private
private_class_method
private_constant
private_instance_methods
private_methods
proc
process_select_args
process_with_args
prohibit_shard_swapping
protected
protected_environments
protected_instance_methods
protected_methods
public
public_class_method
public_constant
public_instance_method
public_instance_methods
public_method
public_methods
public_send
putc
puts
query_constraints
query_constraints_list
quote_bound_value
quoted_primary_key
quoted_table_name
raise
raise_conflict_error
raise_if_bind_arity_mismatch
raise_nested_attributes_record_not_found
rand
reader_method
readline
readlines
readonly
readonly_attributes
readonly_value
record_cursor_values
record_timestamps
records
redefine_method
redefine_singleton_method
reduce
references
references_values
refinements
reflect_on_aggregation
reflect_on_all_aggregations
reflect_on_all_associations
reflect_on_all_autosave_associations
reflect_on_association
reflections
regroup
reject
reject_new_record
relation
relation_delegate_class
relation_with
release_connection
reload
reload_schema_from_cache
remove_class_variable
remove_connection
remove_const
remove_instance_variable
remove_method
remove_possible_method
remove_possible_singleton_method
render_bind
reorder
reordering_value
replace_bind_variable
replace_bind_variables
replace_named_bind_variables
require
require_dependency
require_relative
reselect
reset
reset_callbacks
reset_column_information
reset_counters
reset_default_attributes
reset_locking_column
reset_primary_key
reset_sequence_name
reset_table_name
resolve_arel_attributes
resolve_attribute_name
resolve_config_for_connection
resolve_type_name
respond_to
respond_to_missing
respond_to_without_attributes
restore_attribute
retrieve_connection
reverse
reverse_each
reverse_order
reverse_order_value
reverse_sql_order
rewhere
rindex
rolledback
rotate
ruby2_keywords
run_commit_callbacks_on_first_saved_instances_in_transaction
run_validations
sample
sanitize_for_mass_assignment
sanitize_forbidden_attributes
sanitize_order_arguments
sanitize_sql
sanitize_sql_array
sanitize_sql_for_assignment
sanitize_sql_for_conditions
sanitize_sql_for_order
sanitize_sql_hash_for_assignment
sanitize_sql_like
save
saved_change_to_attribute
saved_changes
schema_cache
schema_migrations_table_name
scheme_for
scope
scope_attributes
scope_for_association
scope_for_create
scope_registry
scoping
second
second_to_last
select
select_association_list
select_for_count
select_named_joins
select_values
self
send
sequence_name
serialize
set_base_class
set_callback
set_callbacks
set_options_for_callback
set_temporary_name
set_trace_func
shard_keys
shard_selector
should_record_timestamps
shuffle
signed_id_verifier
signed_id_verifier_secret
silence_redefinition_of_method
singleton_class
singleton_method
singleton_method_added
singleton_method_removed
singleton_method_undefined
singleton_methods
size
skip_callback
skip_preloading_value
skip_query_cache_if_necessary
skip_query_cache_value
skip_time_zone_conversion_for_attributes
sleep
slice
slice_after
slice_before
slice_when
sole
sort
sort_by
source_attribute_from_preserved_attribute
spawn
split
sprintf
srand
sti_class_for
sti_name
store
store_accessor
store_full_class_name
store_full_sti_class
stored_attributes
strict_loading
strict_loading_all
strict_loading_by_default
strict_loading_mode
strict_loading_n_plus_one_only
strict_loading_value
structurally_incompatible_values_for
subclass_from_attributes
subclasses
sum
superclass
suppress
symbol_column_to_string
syscall
system
table
table_name
table_name_prefix
table_name_suffix
tables_in_string
take
take_while
tally
tap
test
then
third
third_to_last
thread_cattr_accessor
thread_cattr_reader
thread_cattr_writer
thread_mattr_accessor
thread_mattr_reader
thread_mattr_writer
throw
time_zone_aware_attributes
time_zone_aware_types
timestamp_attributes_for_create
timestamp_attributes_for_create_in_model
timestamp_attributes_for_update
timestamp_attributes_for_update_in_model
to_a
to_ary
to_enum
to_formatted_s
to_fs
to_h
to_json
to_param
to_query
to_s
to_sentence
to_set
to_sql
to_xml
to_yaml
toggle
token_definitions
touch_all
touch_attributes_with_time
trace_var
transaction
transaction_include_any_action
trap
trigger_transactional_callbacks
true
try
type_cast_calculated_value
type_cast_pluck_values
type_caster
type_condition
type_for
type_for_attribute
type_for_column
uncached
undecorated_table_name
undef_method
undefine_attribute_methods
undefined_instance_methods
uniq
unscope
unscope_values
unscoped
untrace_var
update
update_all
update_attribute
update_counters
upsert
upsert_all
using
valid
validate
validate_column_size
validate_order_args
validates
validates_absence_of
validates_acceptance_of
validates_associated
validates_comparison_of
validates_confirmation_of
validates_each
validates_exclusion_of
validates_format_of
validates_inclusion_of
validates_length_of
validates_numericality_of
validates_presence_of
validates_size_of
validates_uniqueness_of
validates_with
validating_belongs_to_for
validators
validators_on
values
values_for_queries
warn
where
where_clause
where_values_hash
while_preventing_writes
will_be_destroyed
will_save_change_to_attribute
with
with_connection
with_pool_transaction_isolation_level
with_recursive
with_role_and_shard
with_values
without
writer_method
yaml_encoder
yaml_tag
yield_self
zip`.split('\n'),
)
// cspell:enable

/**
 * The class each model is written as: its name in PascalCase, or where Ruby or Rails already has
 * a constant of that name at the top level, that name with `Record` after it (`Monitor` is
 * `MonitorRecord`), numbered on where another model has that one too. Names are compared as the
 * files Zeitwerk loads them from, so two never share one.
 *
 * @param models - Every model of the schema.
 * @returns The class name of each model, by the model's name.
 */
export function activeRecordClassNames(models: readonly DMMF.Model[]) {
  const own = models.map((model) => ({ key: model.name, candidate: makePascalCase(model.name) }))
  const renamed = allocate(
    own
      .filter(({ candidate }) => RUBY_TOP_LEVEL_CONSTANTS.has(candidate))
      .map(({ key, candidate }) => ({ key, candidate: `${candidate}Record` })),
    [...RUBY_TOP_LEVEL_CONSTANTS, ...own.map(({ candidate }) => candidate)],
    makeSnakeCase,
  )
  return new Map(own.map(({ key, candidate }) => [key, renamed.get(key) ?? candidate]))
}

// The names the models are written under: each model's class, and the association each relation
// field stands for. An association is the field's name in snake_case, unless Active Record
// already defines a method of that name on a record (`attributes`, `errors`), which Rails refuses
// an association: then the name Rails would give an association of its class
// (`has_many :contact_attributes`), or where that is no better or is taken by another association
// or a column of the model, the model's own name before it (`organization_errors`).
function railsNames(models: readonly DMMF.Model[]) {
  const classNames = activeRecordClassNames(models)
  const classOf = (modelName: string) => classNames.get(modelName) ?? makePascalCase(modelName)
  const associations = new Map(
    models.map((model): [string, Map<string, string>] => {
      const named = relationEnds(model, models).map(({ field }) => ({
        field,
        name: makeSnakeCase(field.name),
      }))
      const taken = new Set([
        ...ACTIVE_RECORD_INSTANCE_METHODS,
        ...named.map(({ name }) => name),
        ...model.fields.filter((f) => f.kind !== 'object').map((f) => f.dbName ?? f.name),
      ])
      const renamed = allocate(
        named
          .filter(({ name }) => ACTIVE_RECORD_INSTANCE_METHODS.has(name))
          .map(({ field, name }) => {
            const target = underscore(classOf(field.type))
            const conventional = field.isList ? pluralize(target) : target
            return {
              key: field.name,
              candidate: taken.has(conventional)
                ? `${underscore(classOf(model.name))}_${name}`
                : conventional,
            }
          }),
        [...taken],
        makeSnakeCase,
      )
      return [
        model.name,
        new Map(named.map(({ field, name }) => [field.name, renamed.get(field.name) ?? name])),
      ]
    }),
  )
  return {
    classOf,
    associationOf: (modelName: string, fieldName: string) =>
      associations.get(modelName)?.get(fieldName) ?? makeSnakeCase(fieldName),
  }
}

// A Ruby array literal as RuboCop's defaults and rubocop-rails-omakase both
// accept it: %i[] for symbols, %w[] for plain words, and otherwise brackets
// with a space inside (none in an empty pair).
function rubyArray(items: readonly string[]) {
  if (items.length === 0) return '[]'
  if (items.every((item) => /^:[a-z_][a-z0-9_]*$/u.test(item))) {
    return `%i[${items.map((item) => item.slice(1)).join(' ')}]`
  }
  if (items.every((item) => /^"[^\s"\\#\]]+"$/u.test(item))) {
    return `%w[${items.map((item) => item.slice(1, -1)).join(' ')}]`
  }
  return `[ ${items.join(', ')} ]`
}

// An integer literal with the underscores RuboCop asks of five digits or more.
function rubyInteger(value: string) {
  const [sign, digits] = value.startsWith('-') ? ['-', value.slice(1)] : ['', value]
  return digits.length < 5 ? value : `${sign}${digits.replaceAll(/\B(?=(\d{3})+(?!\d))/gu, '_')}`
}

// A composite FK uses Active Record 7.2's array form for
// foreign_key/primary_key; the single-column form stays a plain string.
function foreignKeyOpt(columns: readonly string[]) {
  return columns.length > 1
    ? `foreign_key: ${rubyArray(columns.map((c) => `:${c}`))}`
    : `foreign_key: "${columns[0]}"`
}

// primary_key names the referenced column(s) when they are not the primary
// key Rails reads from the table: without it a FK referencing a unique column
// joins against the primary key.
function primaryKeyOpt(columns: readonly string[], referencesPrimaryKey: boolean) {
  if (referencesPrimaryKey) return []
  return columns.length > 1
    ? [`primary_key: ${rubyArray(columns.map((c) => `:${c}`))}`]
    : [`primary_key: "${columns[0]}"`]
}

// What Rails does to the children when the owner is destroyed, as the
// foreign key's ON DELETE does it in the database: Cascade destroys them
// (callbacks and all), SetNull clears the key, Restrict and NoAction refuse
// with an error on the owner. SetDefault has no Rails counterpart.
const DEPENDENT: { readonly [action: string]: string } = {
  Cascade: 'destroy',
  SetNull: 'nullify',
  Restrict: 'restrict_with_error',
  NoAction: 'restrict_with_error',
}

// A call whose keyword options would run a class-body line past RuboCop's
// 120 columns continues on the next line, the keys aligned under the first
// one (Layout/HashAlignment); when not even the first fits, the keywords all
// move down, aligned under the first argument (Layout/ArgumentAlignment).
function rubyCall(method: string, positional: readonly string[], keywords: readonly string[]) {
  const head = `${method} ${positional.join(', ')}`
  const [firstKeyword, ...rest] = keywords
  if (firstKeyword === undefined) return head
  const fits = `${head}, ${firstKeyword}`.length + 2 <= 120
  const indent = ' '.repeat(fits ? head.length + 2 : method.length + 1)
  const lines = fits ? [`${head}, ${firstKeyword}`] : [`${head},`, `${indent}${firstKeyword}`]
  for (const opt of rest) {
    const last = lines.length - 1
    const joined = `${lines[last]}, ${opt}`
    if (joined.length + 2 <= 120) {
      lines[last] = joined
    } else {
      lines[last] = `${lines[last]},`
      lines.push(`${indent}${opt}`)
    }
  }
  return lines.join('\n')
}

// The `/// @ar.` calls of a doc comment, after the prefix, one call to a
// line. On a field each is a validator, `presence(message: "Title is
// required")` or `presence`, which becomes an option of the field's
// `validates`; on a model each is a whole Ruby line for the class body,
// `validates :a, :b, presence: true, on: :create` or `normalizes :title,
// with: ->(title) { title.strip }`, written as it is. The prose comes first:
// once an `@ar.` call has been written, a line that is neither a call, a
// blank nor another annotation is a problem. A call is not continued on the
// next `///`: a field's call opens its parentheses and closes them on the
// same line, and a model's line does not end in a comma.
function arFieldCallProblem(call: string) {
  if (call.includes('(') && !call.endsWith(')')) {
    return `the @ar. call "${call}" does not close its parentheses on its line; an @ar. call is one /// line`
  }
  if (!/^[a-z_][a-z0-9_]*(?:\s*\([\s\S]*\))?$/u.test(call)) {
    return `the @ar. call "${call}" is not name or name(arguments)`
  }
  return null
}

function arModelLineProblem(call: string) {
  if (call.endsWith(',')) {
    return `the @ar. line "${call}" ends in a comma as if it went on; an @ar. call is one /// line`
  }
  if (!/^[a-z_][a-z0-9_]*[!?]?(?:\s*\([\s\S]*\)|\s[\s\S]*)?$/u.test(call)) {
    return `the @ar. line "${call}" is not a Ruby call, name, name(arguments) or name arguments`
  }
  return null
}

function arCalls(documentation: string | undefined, on: 'model' | 'field') {
  const calls: string[] = []
  const problems: string[] = []
  let annotated = false
  for (const raw of (documentation ?? '').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('@ar.')) {
      annotated = true
      const call = line.slice('@ar.'.length).trim()
      calls.push(call)
      const problem = on === 'field' ? arFieldCallProblem(call) : arModelLineProblem(call)
      if (problem !== null) problems.push(problem)
    } else if (line !== '' && !isAnnotationLine(line) && annotated) {
      problems.push(`the line "${line}" comes after an @ar. call; write the description above them`)
    }
  }
  return { calls, problems }
}

/**
 * What keeps the schema's `@ar.` comments from being read: a description
 * written after the calls, a call left open, a call in a shape that is not a
 * validator. Each names the model or field it is on.
 */
// The association a relation field stands for is validated by its
// `belongs_to`, or by a line on the model; the field itself only
// carries the name Rails reports that on.
function relationFieldProblems(calls: readonly string[]) {
  return calls
    .filter((call) => {
      const { validator } = validatorCall(call)
      return validator !== null && validator !== 'name'
    })
    .map(
      (call) =>
        `the @ar. call "${call}" is on a relation field, which takes only @ar.name; validate the association with an @ar. line on the model`,
    )
}

export function activeRecordProblems(models: readonly DMMF.Model[]) {
  return models.flatMap((model) => [
    ...arCalls(model.documentation, 'model').problems.map(
      (problem) => `model ${model.name}: ${problem}`,
    ),
    ...model.fields.flatMap((field) => {
      const { calls, problems } = arCalls(field.documentation, 'field')
      const notNames = field.kind === 'object' ? relationFieldProblems(calls) : []
      return [...problems, ...notNames].map(
        (problem) => `field ${model.name}.${field.name}: ${problem}`,
      )
    }),
  ])
}

// The top-level pieces of a Ruby argument list, split at commas that are
// not inside brackets or strings.
function splitArguments(text: string) {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1
    } else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

// `{ ja: "...", en: "..." }`: a hash keyed by locale, which is a translation
// rather than a Ruby option. A locale's value is a string literal, or a hash
// of plural forms (`{ one: "...", other: "%{count} ..." }`) as I18n picks
// them by `count`. Anything else is null.
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

function stringLiteral(value: string) {
  const m = value.match(/^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/u)
  return m ? (m[1] ?? m[2] ?? '').replaceAll('\\"', '"') : null
}

type Translation = { locale: string; form: string | null; text: string }

// A locale's hash of plural forms, or null where one of them is not a plural form and a string.
function pluralTranslations(locale: string, forms: string) {
  const found: Translation[] = []
  for (const formPair of splitArguments(forms)) {
    const f = formPair.match(/^([a-z]+):\s*([\s\S]+)$/u)
    const formText = f ? stringLiteral(f[2] ?? '') : null
    if (!f || formText === null || !PLURAL_FORMS.has(f[1] ?? '')) return null
    found.push({ locale, form: f[1] ?? '', text: formText })
  }
  return found
}

function translations(value: string) {
  const inner = value.match(/^\{([\s\S]*)\}$/u)?.[1]
  if (inner === undefined) return null
  const found: Translation[] = []
  for (const pair of splitArguments(inner)) {
    const m = pair.match(/^([a-z]{2,3}(?:[-_][A-Za-z0-9]+)?):\s*([\s\S]+)$/u)
    if (!m) return null
    const [, locale = '', rest = ''] = m
    const text = stringLiteral(rest)
    if (text !== null) {
      found.push({ locale, form: null, text })
      continue
    }
    const forms = rest.match(/^\{([\s\S]*)\}$/u)?.[1]
    if (forms === undefined) return null
    const plural = pluralTranslations(locale, forms)
    if (plural === null) return null
    found.push(...plural)
  }
  return found.length === 0 ? null : found
}

// The i18n error keys a validator's `message:` stands for, as the Rails
// i18n guide lists them: `message:` replaces every message the validator
// can add, so the translation goes under each key it could raise. length's
// are its three; numericality's and comparison's depend on the options
// given (`greater_than: 0` raises `greater_than`), so they are read from
// the call; a validator with no key of its own is `invalid`.
const MESSAGE_KEYS: { readonly [validator: string]: readonly string[] } = {
  presence: ['blank'],
  absence: ['present'],
  format: ['invalid'],
  uniqueness: ['taken'],
  inclusion: ['inclusion'],
  exclusion: ['exclusion'],
  acceptance: ['accepted'],
  confirmation: ['confirmation'],
  associated: ['invalid'],
  length: ['too_long', 'too_short', 'wrong_length'],
}

// The numericality and comparison options that are error keys of their own.
const COMPARISON_KEYS = new Set([
  'greater_than',
  'greater_than_or_equal_to',
  'equal_to',
  'less_than',
  'less_than_or_equal_to',
  'other_than',
  'in',
  'odd',
  'even',
])

// The error key an option of numericality or comparison raises, if it raises one.
function optionKeys(name: string, validator: string) {
  if (COMPARISON_KEYS.has(name)) return [name]
  return name === 'only_integer' && validator === 'numericality' ? ['not_an_integer'] : []
}

function messageKeys(validator: string, options: readonly string[]) {
  const found = MESSAGE_KEYS[validator]
  if (found !== undefined) return found
  if (validator !== 'numericality' && validator !== 'comparison') return ['invalid']
  const keys = options.flatMap((option) =>
    optionKeys(option.match(/^([a-z_]+):/u)?.[1] ?? '', validator),
  )
  return validator === 'numericality' ? ['not_a_number', ...keys] : keys
}

// A call's arguments parted into the options kept for `validates` and the
// ones whose value is a translation hash.
function splitTranslated(args: string) {
  const kept: string[] = []
  const translated: { name: string; found: Translation[] }[] = []
  for (const argument of splitArguments(args)) {
    const pair = argument.match(/^([a-z_][a-z0-9_]*):\s*([\s\S]+)$/u)
    const found = pair ? translations(pair[2] ?? '') : null
    if (pair && found) {
      translated.push({ name: pair[1] ?? '', found })
    } else {
      kept.push(argument)
    }
  }
  return { kept, translated }
}

// One `@ar.` call of a field taken apart: the validator, the option it

// becomes in `validates`, and the translations to write to the locale files
// under Rails' error keys (`too_long:` is one already; `message:` is the
// validator's own).
function validatorCall(call: string) {
  const match = call.match(/^([a-z_][a-z0-9_]*)\s*(?:\(([\s\S]*)\))?$/u)
  if (!match) return { validator: null, option: call, messages: [] }
  const [, validator = '', args = ''] = match
  const messages: { key: string; locale: string; form: string | null; text: string }[] = []
  // `name(ja: "...", en: "...")` is nothing but translations.
  if (validator === 'name') {
    for (const t of translations(`{ ${args} }`) ?? []) {
      messages.push({ key: 'name', locale: t.locale, form: t.form, text: t.text })
    }
    return { validator, option: null, messages }
  }
  // `presence(false)` is Rails' own way of saying no (`validates` skips an
  // option that is false): the validator the schema implied is dropped and
  // nothing is written for it.
  if (args.trim() === 'false') return { validator, option: null, messages }
  const { kept, translated } = splitTranslated(args)
  for (const { name, found } of translated) {
    for (const key of name === 'message' ? messageKeys(validator, kept) : [name]) {
      for (const t of found) {
        messages.push({ key, locale: t.locale, form: t.form, text: t.text })
      }
    }
  }
  const option = kept.length === 0 ? `${validator}: true` : `${validator}: { ${kept.join(', ')} }`
  return { validator, option, messages }
}

type LocaleTree = { [key: string]: string | LocaleTree }

// A plural form is one more key under the message (`too_long: { one:, other: }`).
function form(m: { form: string | null }) {
  return m.form === null ? [] : [m.form]
}

function setPath(tree: LocaleTree, path: readonly string[], text: string) {
  const [head, ...rest] = path
  if (head === undefined) return
  if (rest.length === 0) {
    tree[head] = text
    return
  }
  const next = tree[head]
  const child = typeof next === 'object' ? next : {}
  tree[head] = child
  setPath(child, rest, text)
}

// The YAML of a locale tree, every string double-quoted so `%{count}` and
// Japanese survive as written.
function yamlLines(tree: LocaleTree, depth: number): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      lines.push(
        `${'  '.repeat(depth)}${key}: "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      )
    } else {
      lines.push(`${'  '.repeat(depth)}${key}:`, ...yamlLines(value, depth + 1))
    }
  }
  return lines
}

/**
 * The locale files of the schema's `@ar.` calls, laid out as the Rails i18n
 * guide organises them: `models/<model>/<locale>.yml`, one directory per
 * model and one file per locale it names, so model and attribute names stay
 * apart from the views' text and the defaults. Each holds that model's name
 * from `@ar.name(ja: "...")`, its attributes' names, and the error messages
 * of its validators' translated options, under the keys Rails reads
 * (`activerecord.errors.models.todo.attributes.title.blank`).
 */
export function activeRecordLocaleFiles(models: readonly DMMF.Model[]) {
  const { classOf, associationOf } = railsNames(models)
  return models.flatMap((model) => {
    // The model's `i18n_key`, its class name underscored.
    const modelKey = underscore(classOf(model.name))
    const trees = new Map<string, LocaleTree>()
    const tree = (locale: string) => {
      const found = trees.get(locale) ?? {}
      trees.set(locale, found)
      return found
    }
    for (const call of arCalls(model.documentation, 'model').calls) {
      const { validator, messages } = validatorCall(call)
      if (validator !== 'name') continue
      for (const m of messages) {
        setPath(tree(m.locale), ['activerecord', 'models', modelKey, ...form(m)], m.text)
      }
    }
    // A relation field is the association, which Rails names in snake_case
    // (`belongs_to :user`) and reports a missing `belongs_to` on: its name
    // goes under `user`, the foreign key's under the column, `user_id`.
    for (const field of model.fields) {
      const attribute =
        field.kind === 'object'
          ? associationOf(model.name, field.name)
          : (field.dbName ?? field.name)
      for (const call of arCalls(field.documentation, 'field').calls) {
        const { validator, messages } = validatorCall(call)
        if (field.kind === 'object' && validator !== 'name') continue
        for (const m of messages) {
          setPath(
            tree(m.locale),
            validator === 'name'
              ? ['activerecord', 'attributes', modelKey, attribute, ...form(m)]
              : [
                  'activerecord',
                  'errors',
                  'models',
                  modelKey,
                  'attributes',
                  attribute,
                  m.key,
                  ...form(m),
                ],
            m.text,
          )
        }
      }
    }
    return [...trees]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([locale, content]) => ({
        fileName: `models/${modelKey}/${locale}.yml`,
        code: `${yamlLines({ [locale]: content }, 0).join('\n')}\n`,
      }))
  })
}

// A Ruby symbol key in a hash literal: bare when it is an identifier, quoted
// otherwise ("1st": ...).
function symbolKey(name: string) {
  return /^[a-z_][a-z0-9_]*$/u.test(name) ? name : `"${name}"`
}

// A `belongs_to`: the foreign key on this model, the columns it references on the target.
function belongsToAssociation(
  model: DMMF.Model,
  end: Extract<RelationEnd, { kind: 'belongsTo' }>,
  targetModel: DMMF.Model | undefined,
) {
  const { field } = end
  const fromFields = field.relationFromFields ?? []
  const referencedField = field.relationToFields?.[0] ?? 'id'
  const referencedFields = field.relationToFields ?? ['id']
  return {
    name: field.name,
    targetModel: field.type,
    foreignKeyColumn: fieldColumn(model, fromFields[0] ?? ''),
    primaryKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
    foreignKeyColumns: fromFields.map((c) => fieldColumn(model, c)),
    primaryKeyColumns: referencedFields.map((c) => (targetModel ? fieldColumn(targetModel, c) : c)),
    referencesPrimaryKey: isSameList(
      referencedFields,
      targetModel === undefined ? ['id'] : primaryKeyFields(targetModel),
    ),
    optional: !field.isRequired,
    inverse: end.inverse?.name ?? null,
    inverseIsList: end.inverse?.isList ?? false,
  }
}

// A `has_and_belongs_to_many` through Prisma's implicit join table.
function habtmAssociation(model: DMMF.Model, end: Extract<RelationEnd, { kind: 'manyToMany' }>) {
  const { field } = end
  const [left, right] =
    model.name < field.type ? [model.name, field.type] : [field.type, model.name]
  return {
    name: field.name,
    targetModel: field.type,
    joinTable: `_${field.relationName ?? `${left}To${right}`}`,
    foreignKey: end.isSideA ? 'A' : 'B',
    associationForeignKey: end.isSideA ? 'B' : 'A',
  }
}

// A `has_many` or `has_one`: the foreign key is on the target, in the inverse field.
function ownedAssociation(
  model: DMMF.Model,
  field: DMMF.Field,
  fkField: DMMF.Field,
  targetModel: DMMF.Model,
) {
  const fromFields = fkField.relationFromFields ?? []
  return {
    name: field.name,
    targetModel: field.type,
    foreignKeyColumn: fieldColumn(targetModel, fromFields[0] ?? ''),
    foreignKeyColumns: fromFields.map((c) => fieldColumn(targetModel, c)),
    primaryKeyColumns: (fkField.relationToFields ?? ['id']).map((c) => fieldColumn(model, c)),
    referencesPrimaryKey: isSameList(fkField.relationToFields ?? ['id'], primaryKeyFields(model)),
    inverse: fkField.name,
    // Prisma's default action when the schema names none.
    onDelete: referentialActions(fkField).onDelete,
  }
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const modelsByName = new Map(allModels.map((m) => [m.name, m]))
  const belongsTo: ReturnType<typeof belongsToAssociation>[] = []
  const hasMany: ReturnType<typeof ownedAssociation>[] = []
  const hasOne: ReturnType<typeof ownedAssociation>[] = []
  const habtm: ReturnType<typeof habtmAssociation>[] = []

  for (const end of relationEnds(model, allModels)) {
    const targetModel = modelsByName.get(end.field.type)
    if (end.kind === 'belongsTo') {
      belongsTo.push(belongsToAssociation(model, end, targetModel))
      continue
    }
    if (targetModel === undefined) continue
    if (end.kind === 'manyToMany') {
      habtm.push(habtmAssociation(model, end))
    } else if (end.kind === 'hasMany') {
      hasMany.push(ownedAssociation(model, end.field, end.inverse, targetModel))
    } else {
      hasOne.push(ownedAssociation(model, end.field, end.inverse, targetModel))
    }
  }

  return { belongsTo, hasMany, hasOne, habtm }
}

// A Ruby double-quoted literal: backslash, quote and the interpolation
// sigil are escaped, and newlines are written as escapes so the line holds.
function rubyString(value: string) {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('#', '\\#')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')}"`
}

// The Ruby expression for one literal default of a scalar column, or null
// where the value is not a literal (a database expression, a generator the
// attribute defaults above handle, a type Ruby has no literal for).
function rubyDefault(type: string, value: DMMF.FieldDefault | DMMF.FieldDefaultScalar) {
  if (typeof value === 'object') return null
  switch (type) {
    case 'Boolean':
      return value === true || value === 'true' ? 'true' : 'false'
    case 'Int':
    case 'BigInt':
      return rubyInteger(String(value))
    case 'Float':
      return String(value)
    case 'Decimal':
      return `BigDecimal(${rubyString(String(value))})`
    case 'String':
      return rubyString(String(value))
    case 'DateTime':
      return `Time.iso8601(${rubyString(String(value))})`
    case 'Json':
      return `JSON.parse(${rubyString(String(value))})`
    default:
      return null
  }
}

function nativeLength(field: DMMF.Field) {
  if (!field.nativeType) return null
  const [name, args] = field.nativeType
  if (!['VarChar', 'Char', 'NVarChar', 'NChar'].includes(name)) return null
  const length = Number(args[0])
  return Number.isInteger(length) && length > 0 ? length : null
}

type RailsNames = ReturnType<typeof railsNames>
type Associations = ReturnType<typeof getAssociations>
type FieldDefaultValue = NonNullable<DMMF.Field['default']>

// Prisma names the table after the model as written (Todo -> "Todo")
// unless @@map says otherwise; Rails infers the plural of the class
// (todos), so only a table named that way goes unsaid.
function tableNameLines(model: DMMF.Model, modelSnake: string) {
  const tableName = model.dbName ?? model.name
  return tableName === pluralize(modelSnake) ? [] : [`self.table_name = "${tableName}"`]
}

// Rails reads the primary key from the table, and a model Prisma keys by a unique alone (no `@id`,
// no `@@id`) has none there: without one named here `update` and `destroy` have no column to find
// the row by. The key is the unique the other generators take (`primaryKeyFields`), a compound one
// as the array a composite key is.
function primaryKeyLines(model: DMMF.Model, idField: DMMF.Field | undefined) {
  if (idField !== undefined) {
    const column = idField.dbName ?? idField.name
    return column !== 'id' ? [`self.primary_key = "${column}"`] : []
  }
  const columns = primaryKeyFields(model).map((name) => fieldColumn(model, name))
  const [column] = columns
  if (column === undefined) return []
  return model.primaryKey === null && columns.length === 1
    ? [`self.primary_key = "${column}"`]
    : [`self.primary_key = ${rubyArray(columns.map((c) => `"${c}"`))}`]
}

// A column named "type" triggers Rails single-table inheritance: reading
// rows whose value is not a class name raises ActiveRecord::SubclassNotFound.
function inheritanceColumnLines(model: DMMF.Model) {
  return model.fields.some(
    (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.dbName ?? f.name) === 'type',
  )
    ? ['self.inheritance_column = nil']
    : []
}

// Active Record writes timestamps only into created_at/updated_at (or
// *_on), while Prisma's convention is createdAt/updatedAt, and @updatedAt
// is set by the Prisma client, not the database. alias_attribute is how
// Rails 7.1+ points its timestamp machinery at a column of another name:
// the column is filled on create, bumped on update, and `touch` works.
function createdAtField(model: DMMF.Model) {
  return model.fields.find(
    (f) =>
      f.kind === 'scalar' &&
      f.type === 'DateTime' &&
      !f.isList &&
      (f.name === 'createdAt' || f.name === 'created_at'),
  )
}

function updatedAtField(model: DMMF.Model) {
  return (
    model.fields.find((f) => f.isUpdatedAt === true) ??
    model.fields.find(
      (f) =>
        f.kind === 'scalar' &&
        f.type === 'DateTime' &&
        !f.isList &&
        ['updatedAt', 'updated_at', 'modifiedAt', 'modified_at'].includes(f.name),
    )
  )
}

// What points Rails' timestamp at the field. 'none' where the field's column is one Rails already
// reads; else 'alias', an `alias_attribute`; else, where another field has a column of the
// timestamp's own name (documenso's `Account.created_at`, an Int the OAuth provider sends, beside
// `createdAt`), 'list': the alias would hide that column behind the field's, so the field's column
// joins the list Rails fills instead, and the other column leaves it unless it is a DateTime
// too. Left on the list, Rails would write the time into it, an Int as seconds.
function timestampTarget(
  model: DMMF.Model,
  timestamp: 'created_at' | 'updated_at',
  field: DMMF.Field | undefined,
  railsColumns: readonly string[],
) {
  const column = field === undefined ? timestamp : (field.dbName ?? field.name)
  if (railsColumns.includes(column)) return { kind: 'none' as const, column, removed: [] }
  const other = model.fields.find(
    (f) => f !== field && f.kind !== 'object' && (f.dbName ?? f.name) === timestamp,
  )
  if (other === undefined) return { kind: 'alias' as const, column, removed: [] }
  const keepsTime = other.kind === 'scalar' && other.type === 'DateTime' && !other.isList
  return { kind: 'list' as const, column, removed: keepsTime ? [] : [timestamp] }
}

// An override of the columns Rails fills on create, or on create, update and `touch`.
function timestampListLines(
  event: 'create' | 'update',
  removed: readonly string[],
  added: readonly string[],
) {
  if (removed.length === 0 && added.length === 0) return []
  const minus = removed.length === 0 ? '' : ` - ${rubyArray(removed.map((c) => `"${c}"`))}`
  const plus = added.length === 0 ? '' : ` + ${rubyArray(added.map((c) => `"${c}"`))}`
  return [
    `def self.timestamp_attributes_for_${event}`,
    `  super${minus}${plus}`,
    'end',
    `private_class_method :timestamp_attributes_for_${event}`,
  ]
}

function timestampLines(
  model: DMMF.Model,
  createdField: DMMF.Field | undefined,
  updatedField: DMMF.Field | undefined,
) {
  const created = timestampTarget(model, 'created_at', createdField, ['created_at', 'created_on'])
  const updated = timestampTarget(model, 'updated_at', updatedField, ['updated_at', 'updated_on'])
  // Prisma bumps every @updatedAt column; Active Record only updated_at
  // and updated_on (or the column aliased to updated_at), so the rest are added
  // to the list it fills on create and bumps on update and `touch`.
  const otherUpdatedColumns = model.fields
    .filter(
      (f) =>
        f.isUpdatedAt === true &&
        f !== updatedField &&
        !['updated_at', 'updated_on'].includes(f.dbName ?? f.name),
    )
    .map((f) => f.dbName ?? f.name)
  return [
    ...(created.kind === 'alias' ? [`alias_attribute :created_at, :${created.column}`] : []),
    ...(updated.kind === 'alias' ? [`alias_attribute :updated_at, :${updated.column}`] : []),
    ...(created.kind === 'list'
      ? timestampListLines('create', created.removed, [created.column])
      : []),
    ...timestampListLines('update', updated.removed, [
      ...(updated.kind === 'list' ? [updated.column] : []),
      ...otherUpdatedColumns,
    ]),
  ]
}

// `first`/`last` order by the primary key; a uuid(), cuid() or nanoid()
// key is random, so the created timestamp orders instead, as Rails
// suggests for UUID keys. uuid(7) and ulid() sort by time already.
function isRandomKey(idField: DMMF.Field | undefined) {
  const idDefault = idField?.default
  return (
    typeof idDefault === 'object' &&
    'name' in idDefault &&
    ((idDefault.name === 'uuid' && idDefault.args[0] !== 7) ||
      idDefault.name === 'cuid' ||
      idDefault.name === 'nanoid')
  )
}

// The digits of a second a DateTime column holds: its own precision, or the
// database's default for the type.
function secondDigits(nativeName: string, nativeArgs: readonly string[], provider?: string) {
  if (nativeArgs[0] !== undefined) return Number(nativeArgs[0])
  return provider === 'mysql' && ['DateTime', 'Timestamp', 'Time'].includes(nativeName) ? 0 : 3
}

function sqlServerCastType(nativeName: string) {
  if (nativeName === 'DateTime') return ['PrismaDateTime.new']
  return nativeName === 'SmallDateTime' ? ['PrismaDateTime.new("smalldatetime")'] : []
}

// Where Active Record's own type for a DateTime column would not
// store what Prisma Client stores:
// - SQLite keeps it as text. Prisma writes 2030-01-02T03:04:05.678+00:00
//   and Active Record 2030-01-02 03:04:05.678000, which compare, sort
//   and index as different values; PrismaDateTime (prisma_date_time.rb)
//   writes Prisma's text.
// - A column holding fewer than three digits of a second (Timestamp(0),
//   Time(0), MySQL's bare DateTime, Timestamp and Time) is rounded by
//   the database from the milliseconds Prisma sends, and truncated by
//   Active Record to the column's precision before sending, so 05.678
//   is 06 from one and 05 from the other. precision: 3 sends what
//   Prisma sends and leaves the rounding to the database.
// - SQL Server's DateTime (1/300 s) is rounded by the adapter by an
//   approximation of its own, and a SmallDateTime cut to the second;
//   PrismaDateTime (prisma_date_time.rb) sends milliseconds for the
//   server to round, typed as the column. DateTime2,
//   DateTimeOffset and Time take no precision in Prisma (7 digits).
// - A Timetz column has no Active Record type and reads as a String.
function dateTimeCastType(f: DMMF.Field, provider?: string): readonly string[] {
  if (f.type !== 'DateTime' || f.isList) return []
  if (provider === 'sqlite') return ['PrismaDateTime.new']
  const [nativeName, nativeArgs] = f.nativeType ?? ['', []]
  if (provider === 'sqlserver') return sqlServerCastType(nativeName)
  if (
    ['Timestamp', 'Timestamptz', 'Time', 'Timetz', 'DateTime'].includes(nativeName) &&
    secondDigits(nativeName, nativeArgs, provider) < 3
  ) {
    const timeOfDay = nativeName === 'Time' || nativeName === 'Timetz'
    return [timeOfDay ? ':time' : ':datetime', 'precision: 3']
  }
  return nativeName === 'Timetz' ? [':time'] : []
}

// SecureRandom.uuid_v7 requires Ruby 3.3+; ULID.generate, Cuid.generate,
// Cuid2.call and Nanoid.generate come from the ulid, cuid, cuid2 and
// nanoid gems.
function generatorCall(def: DMMF.FieldDefault) {
  switch (def.name) {
    case 'uuid':
      return def.args[0] === 7 ? 'SecureRandom.uuid_v7' : 'SecureRandom.uuid'
    case 'ulid':
      return 'ULID.generate'
    case 'cuid':
      return def.args[0] === 2 ? 'Cuid2.call' : 'Cuid.generate'
    case 'nanoid':
      return typeof def.args[0] === 'number'
        ? `Nanoid.generate(size: ${def.args[0]})`
        : 'Nanoid.generate'
    default:
      return null
  }
}

// The Ruby default a scalar field's `attribute` carries, or null for none.
function attributeDefault(f: DMMF.Field, def: FieldDefaultValue, provider?: string) {
  // Prisma Client fills now() itself. The database's CURRENT_TIMESTAMP
  // is the same instant elsewhere, but on SQLite it is text of another
  // shape (2030-01-02 03:04:05), and on SQL Server the clock of the
  // server's own zone, which no session setting turns to UTC: there
  // the model fills it as well.
  if (typeof def === 'object' && 'name' in def && def.name === 'now') {
    return provider === 'sqlite' || provider === 'sqlserver' ? '-> { Time.current }' : null
  }
  // No cast type is passed with a generator: a symbol type resolves through
  // the connection adapter at class load, while a bare default keeps
  // the column type untouched.
  if (typeof def === 'object' && 'name' in def) {
    if (f.type !== 'String') return null
    const generator = generatorCall(def)
    return generator === null ? null : `-> { ${generator} }`
  }
  // A literal default is written into the model so a record built in
  // Ruby carries it before it is saved, whatever the table says. A
  // list or JSON value is mutable, so a lambda hands out a fresh one.
  if (typeof def === 'object') {
    const items = def.map((item) => rubyDefault(f.type, item))
    if (!f.isList || items.some((item) => item === null)) return null
    return `-> { ${rubyArray(items.map(String))} }`
  }
  const literal = rubyDefault(f.type, def)
  if (literal === null) return null
  return f.type === 'Json' ? `-> { ${literal} }` : literal
}

function attributeLine(f: DMMF.Field, value: string | null, provider?: string) {
  const castType = dateTimeCastType(f, provider)
  if (castType.length === 0 && value === null) return []
  return [
    rubyCall(
      'attribute',
      [`:${f.dbName ?? f.name}`, ...castType],
      value === null ? [] : [`default: ${value}`],
    ),
  ]
}

function attributeLines(f: DMMF.Field, provider?: string) {
  const def = f.default
  // A list without a default is a nullable array column that the
  // Prisma client reads and writes as []: so does the model.
  if (def === undefined) return attributeLine(f, f.isList ? '-> { [] }' : null, provider)
  if (f.kind === 'enum') return []
  return attributeLine(f, attributeDefault(f, def, provider), provider)
}

type EnumValue = { readonly key: string; readonly name: string; readonly stored: string }

// An enum column whose plural Active Record defines: the stored values,
// checked by an inclusion validation, with its default written as an attribute.
function inclusionEnumLines(
  f: DMMF.Field,
  column: string,
  values: readonly EnumValue[],
  defaultValue: EnumValue | undefined,
) {
  return [
    ...(typeof f.default === 'string' && defaultValue !== undefined
      ? [rubyCall('attribute', [`:${column}`], [`default: "${defaultValue.stored}"`])]
      : []),
    rubyCall(
      'validates',
      [`:${column}`],
      [
        `inclusion: { in: ${rubyArray(values.map((v) => `"${v.stored}"`))}${f.isRequired ? '' : ', allow_nil: true'} }`,
      ],
    ),
  ]
}

function isAffixFree(
  name: (key: string) => string,
  values: readonly EnumValue[],
  taken: ReadonlySet<string>,
) {
  return values.every((v) => !taken.has(name(v.key)) && !RAILS_RESERVED_NAMES.has(name(v.key)))
}

// The keys bare, behind the prefix, or behind the suffix: the first under
// which none of their names is taken.
function enumAffix(column: string, values: readonly EnumValue[], taken: ReadonlySet<string>) {
  return [
    { option: [], name: (key: string) => key },
    { option: ['prefix: true'], name: (key: string) => `${column}_${key}` },
    { option: ['suffix: true'], name: (key: string) => `${key}_${column}` },
  ].find(({ name }) => isAffixFree(name, values, taken))
}

// One enum column's lines; the names its keys take are added to `taken`.
function enumFieldLines(
  f: DMMF.Field,
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum['values']>,
  taken: Set<string>,
) {
  const column = f.dbName ?? f.name
  const values = (enumMap.get(f.type) ?? []).map((v) => ({
    key: makeSnakeCase(v.name),
    name: v.name,
    stored: v.dbName ?? v.name,
  }))
  const defaultValue = values.find((v) => v.name === f.default)
  if (RAILS_RESERVED_NAMES.has(pluralize(column))) {
    return inclusionEnumLines(f, column, values, defaultValue)
  }
  const pairs = values.map((v) => `${symbolKey(v.key)}: "${v.stored}"`).join(', ')
  const affix = enumAffix(column, values, taken)
  const opts = [
    ...(typeof f.default === 'string' && defaultValue !== undefined
      ? [`default: :${symbolKey(defaultValue.key)}`]
      : []),
    ...(affix === undefined ? ['scopes: false', 'instance_methods: false'] : affix.option),
    f.isRequired ? 'validate: true' : 'validate: { allow_nil: true }',
  ]
  if (affix !== undefined) {
    for (const v of values) {
      taken.add(affix.name(v.key))
    }
  }
  return [rubyCall('enum', [`:${column}`, `{ ${pairs} }`], opts)]
}

// Array enum columns get no `enum` DSL (it casts a scalar column). Keys
// are the Rails-cased value names (PENDING_REVIEW -> pending_review, so
// `record.pending_review?` and the `pending_review` scope), the stored
// value stays the database's. Rails names a class method after the
// plural of the enum (`statuses`) and, for each key, the scopes `m` and
// `not_m` and the predicates `m?` and `m!`, where `m` is the key, or
// `column_key` with prefix: true, or `key_column` with suffix: true. It
// raises for a name Active Record or ActiveRecord::Relation defines,
// and for a predicate an earlier enum on the model took: the keys go
// bare where none of their names is taken, else behind the prefix, else
// the suffix (`type_condition` is Active Record's, `condition_type` is
// free), else without scopes and predicates. A plural Active Record
// defines (`values` for a column `value`) cannot be helped by any
// option, so that column is no `enum` at all: it holds the stored
// values, checked by an inclusion validation, with its default written
// as an attribute. A literal default names its key.
// validate: true makes a value outside the enum, or nil where the
// column is NOT NULL, a validation error like the other constraints,
// instead of an ArgumentError on assignment.
function enumLines(model: DMMF.Model, enumMap: ReadonlyMap<string, DMMF.DatamodelEnum['values']>) {
  const taken = new Set<string>()
  return model.fields
    .filter((f) => f.kind === 'enum' && !f.isList)
    .flatMap((f) => enumFieldLines(f, enumMap, taken))
}

// A @@unique pair is validated on the column a person fills in and
// scoped by the rest, as a Rails developer writes it: `validates :slot,
// uniqueness: { scope: :post_id }`, so the error lands on `slot`. A
// foreign key is the scope, unless the set is nothing but foreign keys;
// a column that already answers for another set is passed over, so
// `@@unique([tenantId, email])` and `@@unique([tenantId, handle])` are
// one error on email and one on handle.
// An enum or list member is scope only: `validates` is written for
// scalar columns, so the set is the first scalar's.
function uniqueSetsOf(model: DMMF.Model, foreignKeyFields: ReadonlySet<string>) {
  const scalarColumns = new Set(
    model.fields.filter((f) => f.kind === 'scalar' && !f.isList).map((f) => f.name),
  )
  const taken = new Set(model.fields.filter((f) => f.isUnique && !f.isId).map((f) => f.name))
  return [
    ...model.fields.filter((f) => f.isUnique && !f.isId).map((f) => [f.name]),
    ...model.uniqueFields.map((set) => {
      const columns = set.filter((name) => scalarColumns.has(name))
      const own =
        columns.find((name) => !foreignKeyFields.has(name) && !taken.has(name)) ??
        columns.find((name) => !foreignKeyFields.has(name)) ??
        columns[0] ??
        set[0] ??
        ''
      taken.add(own)
      return [own, ...set.filter((name) => name !== own)]
    }),
  ]
}

// The unique sets by the column that answers for them, each column's in order.
function uniqueSetsByColumn(sets: readonly (readonly string[])[]) {
  const byColumn = new Map<string, (readonly string[])[]>()
  for (const set of sets) {
    const column = set[0] ?? ''
    byColumn.set(column, [...(byColumn.get(column) ?? []), set])
  }
  return byColumn
}

type ValidationContext = {
  readonly model: DMMF.Model
  readonly foreignKeyFields: ReadonlySet<string>
  readonly compositeKeyFields: ReadonlySet<string>
  readonly digestColumns: ReadonlySet<string>
  readonly createdField: DMMF.Field | undefined
  readonly updatedField: DMMF.Field | undefined
  readonly uniqueSets: ReadonlyMap<string, readonly (readonly string[])[]>
  readonly nullableFields: ReadonlySet<string>
}

// `presence(false)` says the column is filled some other way, whatever
// the schema's requirement would have been written as (`inclusion`
// for a Boolean, `exclusion` for Json and Bytes).
function isPresenceRequired(
  f: DMMF.Field,
  own: readonly ReturnType<typeof validatorCall>[],
  ctx: ValidationContext,
) {
  return (
    !own.some(({ validator, option }) => validator === 'presence' && option === null) &&
    f.isRequired &&
    !f.hasDefaultValue &&
    !f.isId &&
    f.isUpdatedAt !== true &&
    !ctx.foreignKeyFields.has(f.name) &&
    !ctx.compositeKeyFields.has(f.name) &&
    !ctx.digestColumns.has(f.dbName ?? f.name) &&
    f !== ctx.createdField &&
    f !== ctx.updatedField
  )
}

function presenceRule(type: string) {
  if (type === 'Boolean') return 'inclusion: { in: [ true, false ] }'
  return type === 'Json' || type === 'Bytes' ? 'exclusion: { in: [ nil ] }' : 'presence: true'
}

// A unique index counts no row whose scope column is NULL (NULLs are
// distinct), so a nullable scope column keeps those rows out of the
// check too: `conditions: -> { where.not(parent_id: nil) }` is empty
// for a record with no parent and exact for one with a parent.
function uniquenessRule(f: DMMF.Field, set: readonly string[], ctx: ValidationContext) {
  const scope = set.slice(1).map((name) => `:${fieldColumn(ctx.model, name)}`)
  const nullable = set
    .slice(1)
    .filter((name) => ctx.nullableFields.has(name))
    .map((name) => `where.not(${fieldColumn(ctx.model, name)}: nil)`)
  const opts = [
    ...(scope.length === 0 ? [] : [`scope: ${scope.length === 1 ? scope[0] : rubyArray(scope)}`]),
    ...(nullable.length === 0 ? [] : [`conditions: -> { ${nullable.join('.')} }`]),
    ...(f.isRequired ? [] : ['allow_nil: true']),
  ]
  return opts.length === 0 ? 'uniqueness: true' : `uniqueness: { ${opts.join(', ')} }`
}

// A field's own `@ar.` validators come after what the schema implies; one
// the schema also wrote (`length`) replaces it, message and all, and
// `presence(false)` takes it away.
function fieldValidationLines(f: DMMF.Field, ctx: ValidationContext) {
  if (!(f.kind === 'scalar' || f.kind === 'enum')) return []
  const column = f.kind === 'scalar' && !f.isList
  const own = arCalls(f.documentation, 'field').calls.map((call) => validatorCall(call))
  const presence = column && isPresenceRequired(f, own, ctx) ? [presenceRule(f.type)] : []
  const length = column && f.type === 'String' ? nativeLength(f) : null
  const lengthOpt = length === null ? [] : [`length: { maximum: ${length} }`]
  // Every set this column answers for: the first joins the column's
  // `validates`, and any other is a `validates` of its own, a hash
  // taking one `uniqueness:`.
  const uniqueness = (column ? (ctx.uniqueSets.get(f.name) ?? []) : []).map((set) =>
    uniquenessRule(f, set, ctx),
  )
  // An own `uniqueness` stands in for the set on the column's line; a
  // set on a line of its own is another constraint and stays.
  const ownValidators = new Set(own.map(({ validator }) => validator))
  const rules = [
    ...[...presence, ...lengthOpt, ...uniqueness.slice(0, 1)].filter(
      (rule) => !ownValidators.has(rule.split(':')[0] ?? ''),
    ),
    ...own.flatMap(({ option }) => (option === null ? [] : [option])),
  ]
  return [
    ...(rules.length === 0 ? [] : [rubyCall('validates', [`:${f.dbName ?? f.name}`], rules)]),
    ...uniqueness.slice(1).map((rule) => rubyCall('validates', [`:${f.dbName ?? f.name}`], [rule])),
  ]
}

// `has_secure_password` (or `has_secure_password :recovery`) validates
// the password through `password`, adding `blank` there when the digest
// is empty: a `presence` on `password_digest` would report it twice.
// With `validations: false` it adds nothing, and the column keeps its own.
function digestColumnsOf(modelLines: readonly string[]) {
  return new Set(
    modelLines.flatMap((line) => {
      const m = line.match(/^has_secure_password(?:\s*\(?\s*:([a-z_][a-z0-9_]*))?/u)
      return m && !/validations:\s*false/u.test(line) ? [`${m[1] ?? 'password'}_digest`] : []
    }),
  )
}

// What the schema promises of a column, as a validation, so a bad value
// is an error on the record rather than an exception from the database:
// a required column without a default must be present (a foreign key is
// the belongs_to's to check, a timestamp is written after validation, an
// enum has validate: true),
// a @unique column or @@unique set is unique, and a VarChar(n) is no
// longer than n. A nullable unique column may be NULL any number of
// times, which allow_nil mirrors. `presence` reads false, {} and "" as
// blank, so a Boolean is held to true or false and a Json or Bytes
// column only to not nil.
function validationLines(
  model: DMMF.Model,
  modelLines: readonly string[],
  createdField: DMMF.Field | undefined,
  updatedField: DMMF.Field | undefined,
) {
  const foreignKeyFields = new Set(
    model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
  )
  const ctx: ValidationContext = {
    model,
    foreignKeyFields,
    compositeKeyFields: new Set(model.primaryKey?.fields),
    digestColumns: digestColumnsOf(modelLines),
    createdField,
    updatedField,
    uniqueSets: uniqueSetsByColumn(uniqueSetsOf(model, foreignKeyFields)),
    nullableFields: new Set(model.fields.filter((g) => !g.isRequired).map((g) => g.name)),
  }
  return model.fields.flatMap((f) => fieldValidationLines(f, ctx))
}

// Rails derives class_name from the association name, camelized, and
// singularized first for a collection (author -> Author, posts -> Post,
// but event_data -> EventDatum), foreign_key from the name on the
// belongs_to side (user_id) and from the owner's class on the has side
// (User -> user_id), and the inverse from the owner's class name (Post
// -> :post, or :posts) as long as no foreign_key is given on either
// side. What matches is left unsaid, as a Rails developer would;
// anything else is written out.
function belongsToLine(
  model: DMMF.Model,
  modelSnake: string,
  a: Associations['belongsTo'][number],
  { classOf, associationOf }: RailsNames,
) {
  const name = associationOf(model.name, a.name)
  const targetClass = classOf(a.targetModel)
  const conventionalKey =
    a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${name}_id`
  // Rails finds the inverse only when the has side needs no
  // foreign_key either, which takes this side to be named after its
  // class, and only a has_one: the plural form is behind
  // automatically_invert_plural_associations, off unless the
  // application turns it on.
  const inverse = a.inverse === null ? null : associationOf(a.targetModel, a.inverse)
  const conventional =
    name === underscore(targetClass) &&
    conventionalKey &&
    a.referencesPrimaryKey &&
    inverse !== null &&
    !a.inverseIsList &&
    inverse === modelSnake
  return rubyCall(
    'belongs_to',
    [`:${name}`],
    [
      ...(camelize(name) === targetClass ? [] : [`class_name: "${targetClass}"`]),
      ...(conventionalKey ? [] : [foreignKeyOpt(a.foreignKeyColumns)]),
      ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
      ...(a.optional ? ['optional: true'] : []),
      ...(inverse === null || conventional ? [] : [`inverse_of: :${inverse}`]),
    ],
  )
}

function hasLine(
  macro: 'has_one' | 'has_many',
  model: DMMF.Model,
  modelSnake: string,
  a: Associations['hasOne'][number],
  { classOf, associationOf }: RailsNames,
) {
  const name = associationOf(model.name, a.name)
  const inverse = associationOf(a.targetModel, a.inverse)
  const targetClass = classOf(a.targetModel)
  const derivedClass = camelize(macro === 'has_many' ? singularize(name) : name) === targetClass
  const conventionalKey =
    a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${modelSnake}_id`
  const conventional =
    conventionalKey && a.referencesPrimaryKey && inverse === modelSnake && derivedClass
  const dependent = DEPENDENT[a.onDelete]
  return rubyCall(
    macro,
    [`:${name}`],
    [
      ...(derivedClass ? [] : [`class_name: "${targetClass}"`]),
      ...(conventionalKey ? [] : [foreignKeyOpt(a.foreignKeyColumns)]),
      ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
      ...(conventional ? [] : [`inverse_of: :${inverse}`]),
      ...(dependent === undefined ? [] : [`dependent: :${dependent}`]),
    ],
  )
}

// Prisma's implicit join table is _AToB with columns A and B, never
// what Rails would derive, so those three options always stay.
function habtmLine(
  model: DMMF.Model,
  a: Associations['habtm'][number],
  { classOf, associationOf }: RailsNames,
) {
  const name = associationOf(model.name, a.name)
  const targetClass = classOf(a.targetModel)
  return rubyCall(
    'has_and_belongs_to_many',
    [`:${name}`],
    [
      ...(camelize(singularize(name)) === targetClass ? [] : [`class_name: "${targetClass}"`]),
      `join_table: "${a.joinTable}"`,
      `foreign_key: "${a.foreignKey}"`,
      `association_foreign_key: "${a.associationForeignKey}"`,
    ],
  )
}

// The model's prose, then each attribute's or association's as an RDoc labelled list.
function docCommentLines(model: DMMF.Model, { associationOf }: RailsNames) {
  const modelProse = stripAnnotations(model.documentation)?.split('\n') ?? []
  const fieldProse = model.fields.flatMap((f) => {
    const [first = '', ...rest] = stripAnnotations(f.documentation)?.split('\n') ?? []
    if (first === '') return []
    const name = f.kind === 'object' ? associationOf(model.name, f.name) : (f.dbName ?? f.name)
    return [`${name}:: ${first}`, ...rest.map((line) => (line === '' ? '' : `  ${line}`))]
  })
  return [
    ...modelProse,
    ...(modelProse.length > 0 && fieldProse.length > 0 ? [''] : []),
    ...fieldProse,
  ].map((line) => (line === '' ? '#' : `# ${line}`))
}

type ModelContext = {
  readonly contextModels: readonly DMMF.Model[]
  readonly enumMap: ReadonlyMap<string, DMMF.DatamodelEnum['values']>
  readonly names: RailsNames
  readonly provider: string | undefined
}

function activeRecordModel(model: DMMF.Model, ctx: ModelContext) {
  const { names, provider } = ctx
  const associations = getAssociations(model, ctx.contextModels)
  const className = names.classOf(model.name)
  // What Rails takes the class to be called by: its foreign key on the
  // other side (user_id) and its inverse there (:user) are this, as its
  // table is this pluralized.
  const modelSnake = underscore(className)
  const idField = model.fields.find((f) => f.isId)
  const createdField = createdAtField(model)
  const updatedField = updatedAtField(model)
  const orderColumnLines =
    isRandomKey(idField) && createdField !== undefined
      ? [`self.implicit_order_column = "${createdField.dbName ?? createdField.name}"`]
      : []
  const attributes = model.fields
    .filter((f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.isList || f.kind === 'scalar'))
    .flatMap((f) => attributeLines(f, provider))
  // The model's own `@ar.` lines, written into the class as they are;
  // `name(...)` is a translation and goes to the locale files instead.
  const modelLines = arCalls(model.documentation, 'model').calls.filter(
    (call) => validatorCall(call).validator !== 'name',
  )
  const associationLines = [
    ...associations.belongsTo.map((a) => belongsToLine(model, modelSnake, a, names)),
    ...associations.hasOne.map((a) => hasLine('has_one', model, modelSnake, a, names)),
    ...associations.hasMany.map((a) => hasLine('has_many', model, modelSnake, a, names)),
    ...associations.habtm.map((a) => habtmLine(model, a, names)),
  ]

  // One blank line between the groups that have anything to say. The
  // model's own lines come last, after the associations: a `has_many
  // :tags, through: :post_tags` raises HasManyThroughOrderError when it
  // is defined before the `has_many :post_tags` it goes through.
  const body = [
    [
      ...tableNameLines(model, modelSnake),
      ...primaryKeyLines(model, idField),
      ...inheritanceColumnLines(model),
      ...orderColumnLines,
    ],
    [...attributes, ...timestampLines(model, createdField, updatedField)],
    enumLines(model, ctx.enumMap),
    validationLines(model, modelLines, createdField, updatedField),
    associationLines,
    modelLines,
  ]
    .filter((group) => group.length > 0)
    .map((group) => group.join('\n'))
    .join('\n\n')
    .split('\n')

  return [
    ...docCommentLines(model, names),
    `class ${className} < ApplicationRecord`,
    ...body.map((line) => (line === '' ? '' : `  ${line}`)),
    'end',
  ].join('\n')
}

export function activeRecordModels(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  provider?: string,
) {
  const contextModels = allModels ?? models
  const ctx: ModelContext = {
    contextModels,
    enumMap: new Map((enums ?? []).map((e) => [e.name, e.values])),
    names: railsNames(contextModels),
    provider,
  }
  return models
    .map((model) => activeRecordModel(model, ctx))
    .filter(Boolean)
    .join('\n\n')
}
