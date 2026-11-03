// cspell:disable -- the names are Ruby's and Rails', run together as they define them.
// Made on Ruby 4.0 and Rails 8.1.4 with the script below, in an application booted with every
// framework `rails/all` loads (Active Storage and Action Text add methods to a model through their
// load hooks); regenerate them when the harness moves to a new series.
//
//   require "rails/all"
//   module Probe
//     class Application < Rails::Application
//       config.load_defaults 8.1
//       config.eager_load = false
//       config.active_storage.service = :local
//     end
//   end
//   Probe::Application.initialize!
//   puts ActiveRecord::AttributeMethods.dangerous_attribute_methods.grep(/\A[a-z_][a-z0-9_]*\z/).sort
//   puts "--"
//   puts Object.constants.map(&:to_s).grep(/\A[A-Z][A-Za-z0-9]*\z/).without("Probe").sort

// The methods a record has from Active Record and not from Object (and the few of Object's it
// counts too): `belongs_to`, `has_one`, `has_many` and `has_and_belongs_to_many` raise
// ArgumentError for an association of one of these names (Association.build asks
// `dangerous_attribute_method?`). Only the names an association can take, in snake_case.
export const ACTIVE_RECORD_INSTANCE_METHODS: ReadonlySet<string> = new Set(
  `
  __callbacks __id__ _assign_attribute _assign_attributes _before_commit_callbacks
  _clear_locking_column _commit_callbacks _committed_already_called _create_callbacks _create_record
  _delete_row _destroy _destroy_callbacks _ensure_no_duplicate_errors _find_callbacks _find_record
  _in_memory_query_constraints_hash _initialize_callbacks _last_transaction_return_status
  _lock_value_for_database _marshal_dump_7_1 _merge_attributes _new_record_before_last_commit
  _query_attribute _query_constraints_hash _raise_readonly_record_error _raise_record_not_destroyed
  _raise_record_not_touched_error _read_attribute _reflections _rollback_callbacks
  _run_before_commit_callbacks _run_commit_callbacks _run_create_callbacks _run_destroy_callbacks
  _run_find_callbacks _run_initialize_callbacks _run_rollback_callbacks _run_save_callbacks
  _run_touch_callbacks _run_update_callbacks _run_validate_callbacks _run_validation_callbacks
  _save_callbacks _touch_callbacks _touch_row _trigger_destroy_callback _trigger_update_callback
  _update_callbacks _update_record _update_row _validate_callbacks _validation_callbacks _validators
  _write_attribute accessed_fields add_to_transaction aggregate_reflections
  all_attributes_for_inspect all_timestamp_attributes_in_model around_save_collection_association
  assign_attributes assign_multiparameter_attributes
  assign_nested_attributes_for_collection_association
  assign_nested_attributes_for_one_to_one_association assign_nested_parameter_attributes
  assign_to_or_mark_for_destruction associated_records_to_validate_or_save association
  association_instance_get association_instance_set attachment_changes attachment_reflections
  attribute attribute_aliases attribute_before_last_save attribute_before_type_cast attribute_change
  attribute_change_to_be_saved attribute_for_database attribute_for_inspect attribute_in_database
  attribute_method_patterns attribute_missing attribute_names attribute_names_for_partial_inserts
  attribute_names_for_partial_updates attribute_names_for_serialization attribute_previous_change
  attribute_previously_was attribute_was attribute_writer_missing attributes
  attributes_before_type_cast attributes_for_create attributes_for_database attributes_for_inspect
  attributes_for_update attributes_in_database attributes_with_values automatic_scope_inversing
  automatically_invert_plural_associations becomes build_decrypt_attribute_assignments
  build_encrypt_attribute_assignments cache_key cache_key_with_version cache_timestamp_format
  cache_version cache_versioning call_reject_if cant_modify_encrypted_attributes_when_frozen changed
  changed_attribute_names_to_save changed_attributes changes changes_applied changes_to_save
  ciphertext_for class clear_attribute_change clear_attribute_changes clear_changes_information
  clear_timestamp_attributes clear_transaction_record_state clone collection_cache_versioning
  column_for_attribute compute_primary_key connection_handler context_for_validation
  counter_cached_association_names create_or_update current_time_from_proper_timezone decrement
  decrypt decrypt_attributes decrypt_rich_texts default_connection_handler default_role
  default_scope_override default_scopes default_shard default_validation_context defined_enums
  delete deprecated_associations_api_guard destroy destroy_association_async_batch_size
  destroy_association_async_job destroy_associations destroy_row destroyed_by_association dup
  encode_with encrypt encrypt_attributes encrypt_rich_texts encryptable_rich_texts
  encrypted_attributes ensure_proper_type errors execute_callstack_for_multiparameter_attributes
  extract_callstack_for_multiparameter_attributes find_parameter_position find_record_by_id
  forget_attribute_assignments format_for_inspect freeze from_json full_inspect generate_token_for
  halted_callback_hook hash id id_before_type_cast id_for_database id_in_database id_was
  include_root_in_json increment init_attributes init_internals init_with init_with_attributes
  initialize_internals_callback inspect_with_attributes inspection_filter lock_optimistically logger
  mark_for_destruction marshal_dump marshal_load matched_attribute_method
  max_updated_column_timestamp missing_attribute model_name mutations_before_last_save
  mutations_from_database nested_attributes_options normalize_attribute
  normalize_changed_in_place_attributes normalized_attributes partial_inserts partial_updates
  perform_validations pluralize_table_names populate_with_current_scope_attributes pretty_print
  previous_changes primary_key_prefix_type query_attribute query_cast_attribute
  raise_validation_error raw_timestamp_to_cache_version read_attribute
  read_attribute_before_type_cast read_attribute_for_database read_attribute_for_serialization
  read_attribute_for_validation read_store_attribute record_timestamps record_update_timestamps
  reload remember_transaction_record_state report_deprecated_association restore_attributes
  restore_transaction_record_state run_callbacks sanitize_for_mass_assignment
  sanitize_forbidden_attributes save save_belongs_to_association save_collection_association
  save_has_one_association saved_change_to_attribute saved_changes serializable_add_includes
  serializable_attributes serializable_hash signed_id signed_id_verifier_secret
  skip_time_zone_conversion_for_attributes slice store_accessor_for store_full_class_name
  store_full_sti_class strict_loaded_associations strict_loading_mode surreptitiously_touch
  table_name_prefix table_name_suffix time_zone_aware_attributes time_zone_aware_types
  timestamp_attributes_for_create_in_model timestamp_attributes_for_update_in_model to_ary to_gid
  to_gid_param to_global_id to_key to_model to_partial_path to_sgid to_sgid_param
  to_signed_global_id toggle touch touch_deferred_attributes touch_later transaction
  type_cast_attribute_value type_for_attribute update update_attribute update_column update_columns
  validate validate_belongs_to_association validate_collection_association
  validate_encryption_allowed validate_has_one_association validates_absence_of
  validates_acceptance_of validates_comparison_of validates_confirmation_of validates_exclusion_of
  validates_format_of validates_inclusion_of validates_length_of validates_numericality_of
  validates_presence_of validates_size_of validates_with validation_context values_at
  verify_readonly_attribute with_lock with_transaction_returning_status write_attribute
  write_store_attribute
`
    .split(/\s+/u)
    .filter((name) => name !== ''),
)

// The constants Ruby and Rails have defined at the top level by the time a model loads: a model
// class of one of these names reopens it, and fails (`superclass mismatch for class Monitor`,
// `Comparable is not a class`). ApplicationRecord, which every model inherits from,
// PrismaDateTime, written beside them, and the classes of the gems a generated key calls (ulid,
// cuid, cuid2, nanoid) are added to what the script prints.
export const RUBY_TOP_LEVEL_CONSTANTS: ReadonlySet<string> = new Set(
  `
  ARGF ARGV AbstractController ActionCable ActionController ActionDispatch ActionMailbox
  ActionMailer ActionPack ActionText ActionView ActiveJob ActiveModel ActiveRecord ActiveStorage
  ActiveSupport Addrinfo ApplicationRecord Arel ArgumentError Array Base64 BasicObject BasicSocket
  BigDecimal BigMath Binding CGI Class ClosedQueueError Comparable Complex Concurrent
  ConditionVariable Crass Cuid Cuid2 Data Date DateAndTime DateTime Delegator DidYouMean Digest Dir
  ENV EOFError ERB Encoding EncodingError Enumerable Enumerator Errno ErrorHighlight Erubi Etc
  Exception FalseClass Fiber FiberError File FileTest FileUtils Float FloatDomainError Forwardable
  FrozenError GC Gem GlobalID Hash HashWithIndifferentAccess I18n IO IOError IPAddr IPSocket
  IndexError Integer Interrupt JSON Kernel KeyError LoadError LocalJumpError Logger Loofah Mail
  Marcel Marshal MatchData Math Method Mime MiniMime Module Monitor MonitorMixin Mutex NameError
  Nanoid Net NilClass NoMatchingPatternError NoMatchingPatternKeyError NoMemoryError NoMethodError
  Nokogiri NotImplementedError Numeric Object ObjectSpace OpenSSL ParseError Pathname Prism
  PrismaDateTime Proc Process Psych Queue Racc Rack Ractor RactorLocalSingleton Rails Rake Random
  Range RangeError Rational RbConfig Refinement Regexp RegexpError Ruby RubyVM RuntimeError SQLite3
  STDERR STDIN STDOUT ScanError ScriptError SecureRandom SecurityError Set Shellwords Signal
  SignalException SignedGlobalID SimpleDelegator SingleForwardable Singleton SizedQueue Socket
  SocketError StandardError StopIteration String StringIO StringScanner Struct Symbol SyntaxError
  SyntaxSuggest SystemCallError SystemExit SystemStackError TCPServer TCPSocket TSort TZInfo
  Tempfile Thread ThreadError ThreadGroup Time Timeout TracePoint Trix TrueClass TypeError UDPSocket
  ULID UNIXServer UNIXSocket URI UnboundMethod UncaughtThrowError UnicodeNormalize Warning WeakRef
  YAML Zeitwerk ZeroDivisionError Zlib
`
    .split(/\s+/u)
    .filter((name) => name !== ''),
)
// cspell:enable
