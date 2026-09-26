import type { DMMF } from '@prisma/generator-helper'

import { pluralize } from '../utils/humanizer.js'
import { isAnnotationLine, makePascalCase, makeSnakeCase } from '../utils/index.js'

// cspell:disable
// Names an enum key on an Active Record model may not take. Rails defines a
// scope `key` and `not_key` and the predicates `key?` and `key!` for each key:
// it raises for a name Active Record itself defines and, for one Object or
// Kernel defines, overwrites the method with a warning. Made on Active Record
// 8.1 with the script below, one name per line; regenerate it when the harness
// moves to a new series.
//
//   base = ActiveRecord::Base
//   keys = (base.methods + base.private_methods).map(&:to_s).flat_map { |m| [m, m.delete_prefix("not_")] }
//   keys += (base.instance_methods + base.private_instance_methods).map(&:to_s)
//     .select { |m| m.end_with?("?", "!") }.map { |m| m.chomp("?").chomp("!") }
//   keys += %w[nil true false self]
//   puts keys.uniq.select { |k| k.match?(/\A[a-z][a-z0-9_]*\z/) && !k.include?("__") }.sort
const RAILS_RESERVED_NAMES: ReadonlySet<string> = new Set(
  `abort
abstract_class
accepts_nested_attributes_for
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
aggregate_reflections
alias_attribute
alias_attribute_method_definition
alias_method
aliases_by_attribute_name
all
all_timestamp_attributes_in_model
allocate
allow_destroy
ancestors
and
annotate
append_to_connected_to_stack
apply_pending_attribute_modifications
apply_scoping
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
binding
blank
block_given
build
build_column_serializer
build_default_constraint
build_default_scope
build_explain_clause
build_mangled_name
cache
cache_timestamp_format
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
changed
changed_for_autosave
check_model_columns
check_record_limit
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
collecting_queries_for_explain
collection_cache_key
collection_cache_versioning
column_defaults
column_for_attribute
column_names
columns
columns_hash
combine_signed_id_purposes
committed
composed_of
composite_query_constraints_list
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
content_columns
count
count_by_sql
counter_cached_association_names
create
create_or_find_by
create_with
current_preventing_writes
current_role
current_scope
current_shard
current_time_from_proper_timezone
current_transaction
custom_inspect_method_defined
custom_validation_context
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
deterministic_encrypted_attributes
discriminate_class_for_record
display
distinct
dup
duplicable
eager_load
eagerly_generate_alias_attribute_methods
encrypt_attribute
encrypted_attribute
encrypted_attributes
encrypts
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
exit
extend
extended
extending
extract_associated
fail
false
fifth
filter_attributes
find
find_by
find_by_sql
find_by_token_for
find_each
find_in_batches
find_or_create_by
find_or_initialize_by
find_signed
find_sole_by
find_sti_class
first
first_or_create
first_or_initialize
fork
format
forty_two
fourth
freeze
from
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
group
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
in_order_of
include
include_relation_methods
include_root_in_json
included
included_modules
includes
increment
increment_counter
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
internal_metadata_table_name
invalid
inverse_polymorphic_association_changed
invert_where
is_a
iterator
itself
j
jj
joins
kind_of
lambda
last
lease_connection
left_joins
left_outer_joins
limit
load
load_schema
local_stored_attributes
local_variables
lock
lock_optimistically
locking_column
locking_enabled
logger
lookup_ancestors
loop
marked_for_destruction
mattr_accessor
mattr_reader
mattr_writer
maximum
merge
method
method_added
method_missing
method_removed
method_undefined
method_visibility
methods
minimum
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
only
only_columns
open
optimizer_hints
or
order
override_accessors_to_preserve_original
p
param_delimiter
partial_inserts
partial_updates
pending_attribute_modifications
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
prepend
prepend_option
prepended
presence
presence_in
present
preserve_original_encrypted
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
record_timestamps
redefine_method
redefine_singleton_method
references
refinements
reflect_on_aggregation
reflect_on_all_aggregations
reflect_on_all_associations
reflect_on_all_autosave_associations
reflect_on_association
reflections
regroup
reject_new_record
relation
relation_delegate_class
release_connection
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
replace_bind_variable
replace_bind_variables
replace_named_bind_variables
require
require_dependency
require_relative
reselect
reset_callbacks
reset_column_information
reset_counters
reset_default_attributes
reset_locking_column
reset_primary_key
reset_sequence_name
reset_table_name
resolve_attribute_name
resolve_config_for_connection
resolve_type_name
respond_to
respond_to_missing
respond_to_without_attributes
restore_attribute
retrieve_connection
rewhere
rolledback
ruby2_keywords
run_commit_callbacks_on_first_saved_instances_in_transaction
run_validations
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
scope_registry
second
second_to_last
select
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
signed_id_verifier
signed_id_verifier_secret
silence_redefinition_of_method
singleton_class
singleton_method
singleton_method_added
singleton_method_removed
singleton_method_undefined
singleton_methods
skip_callback
skip_time_zone_conversion_for_attributes
sleep
sole
source_attribute_from_preserved_attribute
spawn
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
subclass_from_attributes
subclasses
sum
superclass
suppress
symbol_column_to_string
syscall
system
table_name
table_name_prefix
table_name_suffix
take
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
to_enum
to_json
to_param
to_query
to_s
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
type_caster
type_condition
type_for_attribute
type_for_column
uncached
undecorated_table_name
undef_method
undefine_attribute_methods
undefined_instance_methods
unscope
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
warn
where
while_preventing_writes
will_be_destroyed
will_save_change_to_attribute
with
with_connection
with_pool_transaction_isolation_level
with_recursive
with_role_and_shard
without
writer_method
yaml_encoder
yaml_tag
yield_self`.split('\n'),
)
// cspell:enable

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

function primaryKeyFields(model: DMMF.Model) {
  const idField = model.fields.find((f) => f.isId)
  return idField ? [idField.name] : (model.primaryKey?.fields ?? [])
}

function isSameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i])
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
  return referencesPrimaryKey
    ? []
    : columns.length > 1
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
      if (on === 'field') {
        if (call.includes('(') && !call.endsWith(')')) {
          problems.push(
            `the @ar. call "${call}" does not close its parentheses on its line; an @ar. call is one /// line`,
          )
        } else if (!/^[a-z_][a-z0-9_]*(?:\s*\([\s\S]*\))?$/u.test(call)) {
          problems.push(`the @ar. call "${call}" is not name or name(arguments)`)
        }
      } else if (call.endsWith(',')) {
        problems.push(
          `the @ar. line "${call}" ends in a comma as if it went on; an @ar. call is one /// line`,
        )
      } else if (!/^[a-z_][a-z0-9_]*[!?]?(?:\s*\([\s\S]*\)|\s[\s\S]*)?$/u.test(call)) {
        problems.push(
          `the @ar. line "${call}" is not a Ruby call, name, name(arguments) or name arguments`,
        )
      }
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
export function activeRecordProblems(models: readonly DMMF.Model[]) {
  return models.flatMap((model) => [
    ...arCalls(model.documentation, 'model').problems.map(
      (problem) => `model ${model.name}: ${problem}`,
    ),
    ...model.fields.flatMap((field) => {
      const { calls, problems } = arCalls(field.documentation, 'field')
      // The association a relation field stands for is validated by its
      // `belongs_to`, or by a line on the model; the field itself only
      // carries the name Rails reports that on.
      const notNames =
        field.kind === 'object'
          ? calls
              .filter((call) => {
                const { validator } = validatorCall(call)
                return validator !== null && validator !== 'name'
              })
              .map(
                (call) =>
                  `the @ar. call "${call}" is on a relation field, which takes only @ar.name; validate the association with an @ar. line on the model`,
              )
          : []
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

function translations(value: string) {
  const inner = value.match(/^\{([\s\S]*)\}$/u)?.[1]
  if (inner === undefined) return null
  const found: { locale: string; form: string | null; text: string }[] = []
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
    for (const formPair of splitArguments(forms)) {
      const f = formPair.match(/^([a-z]+):\s*([\s\S]+)$/u)
      const formText = f ? stringLiteral(f[2] ?? '') : null
      if (!f || formText === null || !PLURAL_FORMS.has(f[1] ?? '')) return null
      found.push({ locale, form: f[1] ?? '', text: formText })
    }
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

function messageKeys(validator: string, options: readonly string[]) {
  const found = MESSAGE_KEYS[validator]
  if (found !== undefined) return found
  if (validator !== 'numericality' && validator !== 'comparison') return ['invalid']
  const keys = options.flatMap((option) => {
    const name = option.match(/^([a-z_]+):/u)?.[1] ?? ''
    return COMPARISON_KEYS.has(name)
      ? [name]
      : name === 'only_integer' && validator === 'numericality'
        ? ['not_an_integer']
        : []
  })
  return validator === 'numericality' ? ['not_a_number', ...keys] : keys
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
  const kept: string[] = []
  const translated: {
    name: string
    found: { locale: string; form: string | null; text: string }[]
  }[] = []
  for (const argument of splitArguments(args)) {
    const pair = argument.match(/^([a-z_][a-z0-9_]*):\s*([\s\S]+)$/u)
    const found = pair ? translations(pair[2] ?? '') : null
    if (pair && found) {
      translated.push({ name: pair[1] ?? '', found })
    } else {
      kept.push(argument)
    }
  }
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
  return models.flatMap((model) => {
    const modelKey = makeSnakeCase(model.name)
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
        field.kind === 'object' ? makeSnakeCase(field.name) : (field.dbName ?? field.name)
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

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    primaryKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    optional: boolean
    inverse: string | null
    inverseIsList: boolean
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    inverse: string
    onDelete: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    inverse: string
    onDelete: string
  }[] = []
  const habtm: {
    name: string
    targetModel: string
    joinTable: string
    foreignKey: string
    associationForeignKey: string
  }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const targetModel = allModels.find((m) => m.name === field.type)
      const referencedField = field.relationToFields?.[0] ?? 'id'
      const referencedFields = field.relationToFields ?? ['id']
      // The other side of the relation is the field that shares its name and
      // holds no foreign key; in a self-relation that rules out this field.
      const inverse = targetModel?.fields.find(
        (f) =>
          f.kind === 'object' &&
          f.relationName === field.relationName &&
          !(f.relationFromFields && f.relationFromFields.length > 0),
      )
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn: fieldColumn(model, field.relationFromFields[0]),
        primaryKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
        foreignKeyColumns: field.relationFromFields.map((c) => fieldColumn(model, c)),
        primaryKeyColumns: referencedFields.map((c) =>
          targetModel ? fieldColumn(targetModel, c) : c,
        ),
        referencesPrimaryKey: isSameList(
          referencedFields,
          targetModel === undefined ? ['id'] : primaryKeyFields(targetModel),
        ),
        optional: !field.isRequired,
        inverse: inverse?.name ?? null,
        inverseIsList: inverse?.isList ?? false,
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        habtm.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignKey: model.name === left ? 'A' : 'B',
          associationForeignKey: model.name === left ? 'B' : 'A',
        })
        continue
      }
    }

    const fkField = targetModel.fields.find(
      (f) =>
        f.relationName === field.relationName &&
        f.relationFromFields &&
        f.relationFromFields.length > 0,
    )
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!(fkField && foreignKey)) continue
    const foreignKeyColumn = fieldColumn(targetModel, foreignKey)
    const foreignKeyColumns = (fkField.relationFromFields ?? [foreignKey]).map((c) =>
      fieldColumn(targetModel, c),
    )
    const primaryKeyColumns = (fkField.relationToFields ?? ['id']).map((c) => fieldColumn(model, c))
    const referencesPrimaryKey = isSameList(
      fkField.relationToFields ?? ['id'],
      primaryKeyFields(model),
    )
    // Prisma's default action when the schema names none: Restrict for a
    // required relation, SetNull for an optional one.
    const onDelete = fkField.relationOnDelete ?? (fkField.isRequired ? 'Restrict' : 'SetNull')

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
        referencesPrimaryKey,
        inverse: fkField.name,
        onDelete,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
        referencesPrimaryKey,
        inverse: fkField.name,
        onDelete,
      })
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

export function activeRecordModels(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  provider?: string,
) {
  const contextModels = allModels ?? models
  const enumMap = new Map((enums ?? []).map((e) => [e.name, e.values]))
  return models
    .map((model) => {
      const associations = getAssociations(model, contextModels)
      const className = makePascalCase(model.name)
      // Prisma names the table after the model as written (Todo -> "Todo")
      // unless @@map says otherwise; Rails infers the plural of the class
      // (todos), so only a table named that way goes unsaid.
      const tableName = model.dbName ?? model.name
      const tableNameLines =
        tableName === pluralize(makeSnakeCase(model.name))
          ? []
          : [`self.table_name = "${tableName}"`]
      const idField = model.fields.find((f) => f.isId)
      const compositePkColumns = (model.primaryKey?.fields ?? []).map((name) =>
        fieldColumn(model, name),
      )

      const primaryKeyLines = idField
        ? (idField.dbName ?? idField.name) !== 'id'
          ? [`self.primary_key = "${idField.dbName ?? idField.name}"`]
          : []
        : compositePkColumns.length > 0
          ? [`self.primary_key = ${rubyArray(compositePkColumns.map((c) => `"${c}"`))}`]
          : []

      // A column named "type" triggers Rails single-table inheritance: reading
      // rows whose value is not a class name raises ActiveRecord::SubclassNotFound.
      const inheritanceColumnLines = model.fields.some(
        (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.dbName ?? f.name) === 'type',
      )
        ? ['self.inheritance_column = nil']
        : []

      // Active Record writes timestamps only into created_at/updated_at (or
      // *_on), while Prisma's convention is createdAt/updatedAt, and @updatedAt
      // is set by the Prisma client, not the database. alias_attribute is how
      // Rails 7.1+ points its timestamp machinery at a column of another name:
      // the column is filled on create, bumped on update, and `touch` works.
      const createdField = model.fields.find(
        (f) =>
          f.kind === 'scalar' &&
          f.type === 'DateTime' &&
          !f.isList &&
          (f.name === 'createdAt' || f.name === 'created_at'),
      )
      const updatedField =
        model.fields.find((f) => f.isUpdatedAt) ??
        model.fields.find(
          (f) =>
            f.kind === 'scalar' &&
            f.type === 'DateTime' &&
            !f.isList &&
            ['updatedAt', 'updated_at', 'modifiedAt', 'modified_at'].includes(f.name),
        )
      // Prisma bumps every @updatedAt column; Active Record only updated_at
      // and updated_on (or the column aliased to updated_at), so the rest are added
      // to the list it fills on create and bumps on update and `touch`.
      const otherUpdatedColumns = model.fields
        .filter(
          (f) =>
            f.isUpdatedAt &&
            f !== updatedField &&
            !['updated_at', 'updated_on'].includes(f.dbName ?? f.name),
        )
        .map((f) => `"${f.dbName ?? f.name}"`)
      const timestampLines = [
        ...(createdField &&
        !['created_at', 'created_on'].includes(createdField.dbName ?? createdField.name)
          ? [`alias_attribute :created_at, :${createdField.dbName ?? createdField.name}`]
          : []),
        ...(updatedField &&
        !['updated_at', 'updated_on'].includes(updatedField.dbName ?? updatedField.name)
          ? [`alias_attribute :updated_at, :${updatedField.dbName ?? updatedField.name}`]
          : []),
        ...(otherUpdatedColumns.length > 0
          ? [
              'def self.timestamp_attributes_for_update',
              `  super + ${rubyArray(otherUpdatedColumns)}`,
              'end',
              'private_class_method :timestamp_attributes_for_update',
            ]
          : []),
      ]

      // `first`/`last` order by the primary key; a uuid(), cuid() or nanoid()
      // key is random, so the created timestamp orders instead, as Rails
      // suggests for UUID keys. uuid(7) and ulid() sort by time already.
      const idDefault = idField?.default
      const randomKey =
        typeof idDefault === 'object' &&
        'name' in idDefault &&
        ((idDefault.name === 'uuid' && idDefault.args[0] !== 7) ||
          idDefault.name === 'cuid' ||
          idDefault.name === 'nanoid')
      const orderColumnLines =
        randomKey && createdField
          ? [`self.implicit_order_column = "${createdField.dbName ?? createdField.name}"`]
          : []

      const attributeLines = model.fields
        .filter(
          (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.isList || f.kind === 'scalar'),
        )
        .flatMap((f) => {
          const column = f.dbName ?? f.name
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
          const [nativeName, nativeArgs] = f.nativeType ?? ['', []]
          const secondDigits =
            nativeArgs[0] !== undefined
              ? Number(nativeArgs[0])
              : provider === 'mysql' && ['DateTime', 'Timestamp', 'Time'].includes(nativeName)
                ? 0
                : 3
          const timeOfDay = nativeName === 'Time' || nativeName === 'Timetz'
          const castType =
            f.type !== 'DateTime' || f.isList
              ? []
              : provider === 'sqlite'
                ? ['PrismaDateTime.new']
                : provider === 'sqlserver'
                  ? nativeName === 'DateTime'
                    ? ['PrismaDateTime.new']
                    : nativeName === 'SmallDateTime'
                      ? ['PrismaDateTime.new("smalldatetime")']
                      : []
                  : ['Timestamp', 'Timestamptz', 'Time', 'Timetz', 'DateTime'].includes(
                        nativeName,
                      ) && secondDigits < 3
                    ? [timeOfDay ? ':time' : ':datetime', 'precision: 3']
                    : nativeName === 'Timetz'
                      ? [':time']
                      : []
          const attribute = (value: string | null) =>
            castType.length === 0 && value === null
              ? []
              : [
                  rubyCall(
                    'attribute',
                    [`:${column}`, ...castType],
                    value === null ? [] : [`default: ${value}`],
                  ),
                ]
          const def = f.default
          // A list without a default is a nullable array column that the
          // Prisma client reads and writes as []: so does the model.
          if (def === undefined) return attribute(f.isList ? '-> { [] }' : null)
          if (f.kind === 'enum') return []
          // Prisma Client fills now() itself. The database's CURRENT_TIMESTAMP
          // is the same instant elsewhere, but on SQLite it is text of another
          // shape (2030-01-02 03:04:05), and on SQL Server the clock of the
          // server's own zone, which no session setting turns to UTC: there
          // the model fills it as well.
          if (typeof def === 'object' && 'name' in def && def.name === 'now') {
            return attribute(
              provider === 'sqlite' || provider === 'sqlserver' ? '-> { Time.current }' : null,
            )
          }
          // SecureRandom.uuid_v7 requires Ruby 3.3+; ULID.generate, Cuid.generate,
          // Cuid2.call and Nanoid.generate come from the ulid, cuid, cuid2 and
          // nanoid gems. No cast type is passed: a symbol type resolves through
          // the connection adapter at class load, while a bare default keeps
          // the column type untouched.
          if (typeof def === 'object' && 'name' in def) {
            if (f.type !== 'String') return attribute(null)
            const generator =
              def.name === 'uuid'
                ? def.args[0] === 7
                  ? 'SecureRandom.uuid_v7'
                  : 'SecureRandom.uuid'
                : def.name === 'ulid'
                  ? 'ULID.generate'
                  : def.name === 'cuid'
                    ? def.args[0] === 2
                      ? 'Cuid2.call'
                      : 'Cuid.generate'
                    : def.name === 'nanoid'
                      ? typeof def.args[0] === 'number'
                        ? `Nanoid.generate(size: ${def.args[0]})`
                        : 'Nanoid.generate'
                      : null
            return attribute(generator === null ? null : `-> { ${generator} }`)
          }
          // A literal default is written into the model so a record built in
          // Ruby carries it before it is saved, whatever the table says. A
          // list or JSON value is mutable, so a lambda hands out a fresh one.
          if (typeof def === 'object') {
            const items = def.map((item) => rubyDefault(f.type, item))
            if (!f.isList || items.some((item) => item === null)) return attribute(null)
            return attribute(`-> { ${rubyArray(items.map(String))} }`)
          }
          const literal = rubyDefault(f.type, def)
          if (literal === null) return attribute(null)
          return attribute(f.type === 'Json' ? `-> { ${literal} }` : literal)
        })

      // Array enum columns get no `enum` DSL (it casts a scalar column). Keys
      // are the Rails-cased value names (PENDING_REVIEW -> pending_review, so
      // `record.pending_review?` and the `pending_review` scope), the stored
      // value stays the database's. A key that Active Record or Ruby already
      // defines a method for, or that an earlier enum on the model took, goes
      // behind prefix: true — Rails raises on the first and would define the
      // same `VALUE?` twice for the second. A literal default names its key.
      // validate: true makes a value outside the enum, or nil where the
      // column is NOT NULL, a validation error like the other constraints,
      // instead of an ArgumentError on assignment.
      const enumLines = model.fields
        .filter((f) => f.kind === 'enum' && !f.isList)
        .reduce<{ lines: string[]; seenKeys: Set<string> }>(
          (acc, f) => {
            const values = (enumMap.get(f.type) ?? []).map((v) => ({
              key: makeSnakeCase(v.name),
              name: v.name,
              stored: v.dbName ?? v.name,
            }))
            const pairs = values.map((v) => `${symbolKey(v.key)}: "${v.stored}"`).join(', ')
            const conflicts = values.some(
              (v) => acc.seenKeys.has(v.key) || RAILS_RESERVED_NAMES.has(v.key),
            )
            const defaultValue = values.find((v) => v.name === f.default)
            const opts = [
              ...(typeof f.default === 'string' && defaultValue !== undefined
                ? [`default: :${symbolKey(defaultValue.key)}`]
                : []),
              ...(conflicts ? ['prefix: true'] : []),
              f.isRequired ? 'validate: true' : 'validate: { allow_nil: true }',
            ]
            for (const v of values) {
              acc.seenKeys.add(v.key)
            }
            return {
              lines: [
                ...acc.lines,
                rubyCall('enum', [`:${f.dbName ?? f.name}`, `{ ${pairs} }`], opts),
              ],
              seenKeys: acc.seenKeys,
            }
          },
          { lines: [], seenKeys: new Set() },
        ).lines

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
      const foreignKeyFields = new Set(
        model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
      )
      const compositeKeyFields = new Set(model.primaryKey?.fields)
      // A @@unique pair is validated on the column a person fills in and
      // scoped by the rest, as a Rails developer writes it: `validates :slot,
      // uniqueness: { scope: :post_id }`, so the error lands on `slot`. A
      // foreign key is the scope, unless the set is nothing but foreign keys;
      // a column that already answers for another set is passed over, so
      // `@@unique([tenantId, email])` and `@@unique([tenantId, handle])` are
      // one error on email and one on handle.
      // An enum or list member is scope only: `validates` is written for
      // scalar columns, so the set is the first scalar's.
      const scalarColumns = new Set(
        model.fields.filter((f) => f.kind === 'scalar' && !f.isList).map((f) => f.name),
      )
      const taken = new Set(model.fields.filter((f) => f.isUnique && !f.isId).map((f) => f.name))
      const uniqueSets = [
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
      // The model's own `@ar.` lines, written into the class as they are;
      // `name(...)` is a translation and goes to the locale files instead.
      const modelLines = arCalls(model.documentation, 'model').calls.filter(
        (call) => validatorCall(call).validator !== 'name',
      )
      // `has_secure_password` (or `has_secure_password :recovery`) validates
      // the password through `password`, adding `blank` there when the digest
      // is empty: a `presence` on `password_digest` would report it twice.
      // With `validations: false` it adds nothing, and the column keeps its own.
      const digestColumns = new Set(
        modelLines.flatMap((line) => {
          const m = line.match(/^has_secure_password(?:\s*\(?\s*:([a-z_][a-z0-9_]*))?/u)
          return m && !/validations:\s*false/u.test(line) ? [`${m[1] ?? 'password'}_digest`] : []
        }),
      )
      // A field's own `@ar.` validators come after what the schema implies; one
      // the schema also wrote (`length`) replaces it, message and all, and
      // `presence(false)` takes it away.
      const validationLines = model.fields.flatMap((f) => {
        if (!(f.kind === 'scalar' || f.kind === 'enum')) return []
        const column = f.kind === 'scalar' && !f.isList
        const own = arCalls(f.documentation, 'field').calls.map((call) => validatorCall(call))
        // `presence(false)` says the column is filled some other way, whatever
        // the schema's requirement would have been written as (`inclusion`
        // for a Boolean, `exclusion` for Json and Bytes).
        const required =
          column &&
          !own.some(({ validator, option }) => validator === 'presence' && option === null) &&
          f.isRequired &&
          !f.hasDefaultValue &&
          !f.isId &&
          !f.isUpdatedAt &&
          !foreignKeyFields.has(f.name) &&
          !compositeKeyFields.has(f.name) &&
          !digestColumns.has(f.dbName ?? f.name) &&
          f !== createdField &&
          f !== updatedField
        const presence = !required
          ? []
          : f.type === 'Boolean'
            ? ['inclusion: { in: [ true, false ] }']
            : f.type === 'Json' || f.type === 'Bytes'
              ? ['exclusion: { in: [ nil ] }']
              : ['presence: true']
        const length = column && f.type === 'String' ? nativeLength(f) : null
        const lengthOpt = length === null ? [] : [`length: { maximum: ${length} }`]
        // Every set this column answers for: the first joins the column's
        // `validates`, and any other is a `validates` of its own, a hash
        // taking one `uniqueness:`.
        // A unique index counts no row whose scope column is NULL (NULLs are
        // distinct), so a nullable scope column keeps those rows out of the
        // check too: `conditions: -> { where.not(parent_id: nil) }` is empty
        // for a record with no parent and exact for one with a parent.
        const uniqueness = (column ? uniqueSets.filter((set) => set[0] === f.name) : []).map(
          (set) => {
            const scope = set.slice(1).map((name) => `:${fieldColumn(model, name)}`)
            const nullable = set
              .slice(1)
              .filter((name) => model.fields.some((g) => g.name === name && !g.isRequired))
              .map((name) => `where.not(${fieldColumn(model, name)}: nil)`)
            const opts = [
              ...(scope.length === 0
                ? []
                : [`scope: ${scope.length === 1 ? scope[0] : rubyArray(scope)}`]),
              ...(nullable.length === 0 ? [] : [`conditions: -> { ${nullable.join('.')} }`]),
              ...(f.isRequired ? [] : ['allow_nil: true']),
            ]
            return opts.length === 0 ? 'uniqueness: true' : `uniqueness: { ${opts.join(', ')} }`
          },
        )
        // An own `uniqueness` stands in for the set on the column's line; a
        // set on a line of its own is another constraint and stays.
        const rules = [
          ...[...presence, ...lengthOpt, ...uniqueness.slice(0, 1)].filter(
            (rule) => !own.some(({ validator }) => validator === rule.split(':')[0]),
          ),
          ...own.flatMap(({ option }) => (option === null ? [] : [option])),
        ]
        return [
          ...(rules.length === 0 ? [] : [rubyCall('validates', [`:${f.dbName ?? f.name}`], rules)]),
          ...uniqueness
            .slice(1)
            .map((rule) => rubyCall('validates', [`:${f.dbName ?? f.name}`], [rule])),
        ]
      })

      // Rails derives class_name from the association name (author -> Author,
      // posts -> Post), foreign_key from the name on the belongs_to side
      // (user_id) and from the owner's class on the has side (User -> user_id),
      // and the inverse from the owner's class name (Post -> :post, or :posts)
      // as long as no foreign_key is given on either side. What matches is
      // left unsaid, as a Rails developer would; anything else is written out.
      const modelSnake = makeSnakeCase(model.name)
      const belongsToLines = associations.belongsTo.map((a) => {
        const name = makeSnakeCase(a.name)
        // Rails finds the inverse only when the has side needs no
        // foreign_key either, which takes this side to be named after its
        // class, and only a has_one: the plural form is behind
        // automatically_invert_plural_associations, off unless the
        // application turns it on.
        const conventional =
          name === makeSnakeCase(a.targetModel) &&
          a.foreignKeyColumns.length === 1 &&
          a.foreignKeyColumns[0] === `${name}_id` &&
          a.referencesPrimaryKey &&
          a.inverse !== null &&
          !a.inverseIsList &&
          makeSnakeCase(a.inverse) === modelSnake
        return rubyCall(
          'belongs_to',
          [`:${name}`],
          [
            ...(makePascalCase(a.targetModel) === makePascalCase(name)
              ? []
              : [`class_name: "${makePascalCase(a.targetModel)}"`]),
            ...(a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${name}_id`
              ? []
              : [foreignKeyOpt(a.foreignKeyColumns)]),
            ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
            ...(a.optional ? ['optional: true'] : []),
            ...(a.inverse === null || conventional
              ? []
              : [`inverse_of: :${makeSnakeCase(a.inverse)}`]),
          ],
        )
      })

      const hasLines = (
        macro: 'has_one' | 'has_many',
        list: typeof associations.hasOne | typeof associations.hasMany,
      ) =>
        list.map((a) => {
          const name = makeSnakeCase(a.name)
          const inverse = makeSnakeCase(a.inverse)
          const conventional =
            a.foreignKeyColumns.length === 1 &&
            a.foreignKeyColumns[0] === `${modelSnake}_id` &&
            a.referencesPrimaryKey &&
            inverse === modelSnake &&
            name ===
              (macro === 'has_many'
                ? pluralize(makeSnakeCase(a.targetModel))
                : makeSnakeCase(a.targetModel))
          const derivedClass =
            macro === 'has_many'
              ? name === pluralize(makeSnakeCase(a.targetModel))
              : makePascalCase(name) === makePascalCase(a.targetModel)
          const dependent = DEPENDENT[a.onDelete]
          return rubyCall(
            macro,
            [`:${name}`],
            [
              ...(derivedClass ? [] : [`class_name: "${makePascalCase(a.targetModel)}"`]),
              ...(a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${modelSnake}_id`
                ? []
                : [foreignKeyOpt(a.foreignKeyColumns)]),
              ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
              ...(conventional ? [] : [`inverse_of: :${inverse}`]),
              ...(dependent === undefined ? [] : [`dependent: :${dependent}`]),
            ],
          )
        })

      const hasOneLines = hasLines('has_one', associations.hasOne)
      const hasManyLines = hasLines('has_many', associations.hasMany)

      // Prisma's implicit join table is _AToB with columns A and B, never
      // what Rails would derive, so those three options always stay.
      const habtmLines = associations.habtm.map((a) => {
        const name = makeSnakeCase(a.name)
        return rubyCall(
          'has_and_belongs_to_many',
          [`:${name}`],
          [
            ...(name === pluralize(makeSnakeCase(a.targetModel))
              ? []
              : [`class_name: "${makePascalCase(a.targetModel)}"`]),
            `join_table: "${a.joinTable}"`,
            `foreign_key: "${a.foreignKey}"`,
            `association_foreign_key: "${a.associationForeignKey}"`,
          ],
        )
      })

      const associationLines = [...belongsToLines, ...hasOneLines, ...hasManyLines, ...habtmLines]

      // One blank line between the groups that have anything to say. The
      // model's own lines come last, after the associations: a `has_many
      // :tags, through: :post_tags` raises HasManyThroughOrderError when it
      // is defined before the `has_many :post_tags` it goes through.
      const body = [
        [...tableNameLines, ...primaryKeyLines, ...inheritanceColumnLines, ...orderColumnLines],
        [...attributeLines, ...timestampLines],
        enumLines,
        validationLines,
        associationLines,
        modelLines,
      ]
        .filter((group) => group.length > 0)
        .map((group) => group.join('\n'))
        .join('\n\n')
        .split('\n')

      return [
        `class ${className} < ApplicationRecord`,
        ...body.map((line) => (line === '' ? '' : `  ${line}`)),
        'end',
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
