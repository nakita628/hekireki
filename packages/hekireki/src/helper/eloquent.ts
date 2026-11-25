import type { DMMF } from '@prisma/generator-helper'

import { docBlockLines, stripAnnotations } from '../annotation/index.js'
import { makePascalCase } from '../naming/case.js'
import type { RelationEnd } from '../prisma/model.js'
import { fieldColumn, relationEnds } from '../prisma/model.js'
import { ELOQUENT_MODEL_METHODS } from './eloquent-model-methods.js'

export function prismaTypeToEloquentCast(type: string) {
  if (type === 'Int') return 'integer'
  if (type === 'BigInt') return 'integer'
  if (type === 'Float') return 'float'
  if (type === 'Boolean') return 'boolean'
  if (type === 'DateTime') return 'datetime'
  if (type === 'Json') return 'array'
  return null
}

const MODEL = 'Illuminate\\Database\\Eloquent\\Model'
const RELATIONS = 'Illuminate\\Database\\Eloquent\\Relations\\'
const CONCERNS = 'Illuminate\\Database\\Eloquent\\Concerns\\'
const STR = 'Illuminate\\Support\\Str'

// A PHP single-quoted string: a backslash and a quote are the only characters it escapes.
function phpString(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

// PostgreSQL and CockroachDB are the providers whose column holds a scalar list as an array, and
// whose driver hands it over as the array's literal (`{a,b}`).
function hasArrayColumns(provider: string | undefined) {
  return provider === 'postgresql' || provider === 'cockroachdb'
}

// What AsPrismaList reads the items of a list as, where they are not strings: the argument of
// the cast, and the type of an item for the `@property` tag.
const LIST_ITEM_TYPES: { readonly [prismaType: string]: readonly [string, string] } = {
  Int: ['int', 'int'],
  BigInt: ['int', 'int'],
  Float: ['float', 'float'],
  Boolean: ['bool', 'bool'],
  Decimal: ['decimal', 'string'],
  Bytes: ['bytes', 'string'],
  Json: ['json', 'mixed'],
}

// The type an attribute reads as through its cast, for the `@property` tag that carries a field's
// prose. A list other than DateTime[] has a cast where the column is an array, and elsewhere
// reads as the driver hands it over.
const PHP_SCALAR_TYPES: { readonly [prismaType: string]: string } = {
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Boolean: 'bool',
  DateTime: '\\Carbon\\CarbonInterface',
  Json: 'mixed',
}

function phpValueType(
  field: DMMF.Field,
  enumNames: ReadonlySet<string>,
  provider: string | undefined,
) {
  if (field.isList && field.type === 'DateTime') return 'list<\\Carbon\\CarbonInterface>'
  if (field.isList && !hasArrayColumns(provider)) return 'mixed'
  if (field.isList && field.kind === 'enum') {
    return `list<${enumNames.has(field.type) ? field.type : 'string'}>`
  }
  if (field.isList) return `list<${LIST_ITEM_TYPES[field.type]?.[1] ?? 'string'}>`
  if (field.kind === 'enum' && enumNames.has(field.type)) return field.type
  return PHP_SCALAR_TYPES[field.type] ?? 'string'
}

function phpPropertyType(
  field: DMMF.Field,
  enumNames: ReadonlySet<string>,
  provider: string | undefined,
) {
  const type = phpValueType(field, enumNames, provider)
  return type === 'mixed' || field.isRequired ? type : `${type}|null`
}

/**
 * What Eloquent keys a model by: its `@id`, or its `@@id`, or where it has neither, the first
 * unique of required fields (Prisma requires a model without an id to have one). One field is
 * `$primaryKey`; several are named column by column, as Eloquent has no composite key.
 */
function keyFieldNames(model: DMMF.Model, id: DMMF.Field | undefined): readonly string[] {
  if (id !== undefined) return [id.name]
  if (model.primaryKey && model.primaryKey.fields.length > 0) return model.primaryKey.fields
  const requiredFields = new Set(model.fields.filter((f) => f.isRequired).map((f) => f.name))
  return (
    [...model.fields.filter((f) => f.isUnique).map((f) => [f.name]), ...model.uniqueFields].find(
      (names) => names.every((name) => requiredFields.has(name)),
    ) ?? []
  )
}

function modelKey(model: DMMF.Model) {
  const id = model.fields.find((f) => f.isId)
  const names = keyFieldNames(model, id)
  return {
    field: names.length === 1 ? model.fields.find((f) => f.name === names[0]) : undefined,
    columns: names.map((name) => fieldColumn(model, name)),
  }
}

// Eloquent has no composite-key relations: emitting one would silently
// half-join on the first column, so composite FKs produce no relation
// method (the scalar columns themselves are still generated).
function belongsToAssociation(
  model: DMMF.Model,
  field: DMMF.Field,
  targetModel: DMMF.Model | undefined,
) {
  const fromFields = field.relationFromFields ?? []
  if (fromFields.length > 1) return null
  const referencedField = field.relationToFields?.[0] ?? 'id'
  const ownerKeyColumn = targetModel ? fieldColumn(targetModel, referencedField) : referencedField
  const targetKey = targetModel ? modelKey(targetModel).columns : ['id']
  return {
    name: field.name,
    targetModel: field.type,
    foreignKeyColumn: fieldColumn(model, fromFields[0] ?? ''),
    ownerKeyColumn:
      targetKey.length === 1 && targetKey[0] === ownerKeyColumn ? null : ownerKeyColumn,
  }
}

// Prisma's join table holds the model that sorts first in "A". A model related to itself
// is on both sides: the relation field whose name sorts first reads its own key from "A".
function belongsToManyAssociation(
  model: DMMF.Model,
  end: Extract<RelationEnd, { kind: 'manyToMany' }>,
) {
  const { field } = end
  const [left, right] = end.isSideA ? [model.name, field.type] : [field.type, model.name]
  return {
    name: field.name,
    targetModel: field.type,
    joinTable: `_${field.relationName ?? `${left}To${right}`}`,
    foreignPivotKey: end.isSideA ? 'A' : 'B',
    relatedPivotKey: end.isSideA ? 'B' : 'A',
  }
}

function ownedAssociation(
  model: DMMF.Model,
  field: DMMF.Field,
  fkField: DMMF.Field,
  targetModel: DMMF.Model,
  ownKey: string | null | undefined,
) {
  const fromFields = fkField.relationFromFields ?? []
  if (fromFields.length > 1) return null
  const foreignKeyColumn = fieldColumn(targetModel, fromFields[0] ?? '')
  const referencedColumn = fieldColumn(model, fkField.relationToFields?.[0] ?? 'id')
  const localKeyColumn = referencedColumn === ownKey ? null : referencedColumn
  return { name: field.name, targetModel: field.type, foreignKeyColumn, localKeyColumn }
}

function nonNull<T>(value: T | null) {
  return value === null ? [] : [value]
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const modelsByName = new Map(allModels.map((m) => [m.name, m]))
  const belongsTo: NonNullable<ReturnType<typeof belongsToAssociation>>[] = []
  const hasMany: NonNullable<ReturnType<typeof ownedAssociation>>[] = []
  const hasOne: NonNullable<ReturnType<typeof ownedAssociation>>[] = []
  const belongsToMany: ReturnType<typeof belongsToManyAssociation>[] = []

  // A key column is written out only where it is not the key Eloquent would take, the related
  // model's own for a belongsTo and this one's for a hasOne or hasMany.
  const ownKeyColumns = modelKey(model).columns
  const ownKey = ownKeyColumns.length === 1 ? ownKeyColumns[0] : null
  for (const end of relationEnds(model, allModels)) {
    const targetModel = modelsByName.get(end.field.type)
    if (end.kind === 'belongsTo') {
      belongsTo.push(...nonNull(belongsToAssociation(model, end.field, targetModel)))
      continue
    }
    if (targetModel === undefined) continue
    if (end.kind === 'manyToMany') {
      belongsToMany.push(belongsToManyAssociation(model, end))
    } else if (end.kind === 'hasMany') {
      hasMany.push(...nonNull(ownedAssociation(model, end.field, end.inverse, targetModel, ownKey)))
    } else {
      hasOne.push(...nonNull(ownedAssociation(model, end.field, end.inverse, targetModel, ownKey)))
    }
  }

  return { belongsTo, hasMany, hasOne, belongsToMany }
}

const CREATED_ALIASES = new Set(['created_at', 'createdAt'])
const UPDATED_ALIASES = new Set(['updated_at', 'updatedAt', 'modified_at', 'modifiedAt'])

function findTimestamps(fields: readonly DMMF.Field[]) {
  const created = fields.find((f) => f.type === 'DateTime' && CREATED_ALIASES.has(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt === true) ??
    fields.find((f) => f.type === 'DateTime' && UPDATED_ALIASES.has(f.name))

  const exclude = new Set([created?.name, updated?.name].filter((name) => name !== undefined))

  return {
    createdColumn: created ? (created.dbName ?? created.name) : null,
    updatedColumn: updated ? (updated.dbName ?? updated.name) : null,
    exclude,
  }
}

// The raw value Eloquent keeps for a literal @default, or null where the database fills it
// (now(), autoincrement(), dbgenerated()) or Prisma's client makes it (uuid(), cuid(), ulid()).
// Eloquent holds attributes as the database has them, before its casts: a DateTime as the model
// writes one (ISO 8601 on SQLite, `Y-m-d H:i:s.v` elsewhere), in UTC; an enum member as its @map
// value; Json as its text.
function enumDefault(field: DMMF.Field, def: unknown, enums: readonly DMMF.DatamodelEnum[]) {
  const member = enums.find((e) => e.name === field.type)?.values.find((v) => v.name === def)
  return member ? phpString(member.dbName ?? member.name) : null
}

function numberDefault(field: DMMF.Field, def: number) {
  if (field.type === 'Decimal') return phpString(String(def))
  return field.type === 'Float' && Number.isInteger(def) ? `${def}.0` : String(def)
}

function dateTimeDefault(field: DMMF.Field, def: string, provider: string | undefined) {
  const iso = new Date(def).toISOString()
  const native = field.nativeType?.[0]
  if (native === 'Date') return phpString(iso.slice(0, 10))
  if (native === 'Time' || native === 'Timetz') return phpString(iso.slice(11, 23))
  if (provider === 'sqlite') return phpString(iso.replace('Z', '+00:00'))
  const naive = iso.slice(0, 23).replace('T', ' ')
  return phpString(
    provider === 'postgresql' || provider === 'cockroachdb' ? `${naive}+00:00` : naive,
  )
}

function phpDefault(
  field: DMMF.Field,
  enums: readonly DMMF.DatamodelEnum[],
  provider: string | undefined,
) {
  const def = field.default
  if (def === undefined || def === null || field.isList || typeof def === 'object') return null
  if (field.kind === 'enum') return enumDefault(field, def, enums)
  if (typeof def === 'boolean') return String(def)
  if (typeof def === 'number') return numberDefault(field, def)
  // DMMF carries BigInt defaults as digit strings and DateTime literals as ISO strings.
  if (field.type === 'BigInt') return def
  if (field.type === 'DateTime') return dateTimeDefault(field, def, provider)
  if (field.type === 'Bytes') return null
  return phpString(def)
}

/**
 * The cast a Prisma `Bytes` column takes: written as a stream, which PDO binds as a LOB, so SQLite
 * keeps a BLOB (a string would be TEXT, which Prisma Client refuses to read as bytes) and
 * PostgreSQL a bytea; read back as the string of its bytes, whether the driver hands over a
 * string or, as pdo_pgsql does, a stream. In `toArray()` and `toJson()` it is base64, as Prisma
 * writes Bytes in JSON: raw bytes are not UTF-8, and `json_encode` refuses them.
 */
export function eloquentBytesCast(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Contracts\\Database\\Eloquent\\SerializesCastableAttributes;
use Illuminate\\Database\\Eloquent\\Model;

class AsBytes implements CastsAttributes, SerializesCastableAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if (is_resource($value)) {
            rewind($value);

            return stream_get_contents($value);
        }

        return $value;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null || is_resource($value)) {
            return $value;
        }
        $stream = fopen('php://memory', 'r+b');
        fwrite($stream, (string) $value);
        rewind($stream);

        return $stream;
    }

    public function serialize(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : base64_encode($value);
    }
}`
}

// The names PHP keeps from a class or an enum, lower-cased: its keywords and its type names.
const PHP_RESERVED_CLASS_NAMES = new Set(
  `
  __halt_compiler abstract and array as bool break callable case catch class clone const continue
  declare default die do echo else elseif empty enddeclare endfor endforeach endif endswitch
  endwhile eval exit extends false final finally float fn for foreach function global goto if
  implements include include_once instanceof insteadof int interface isset iterable list match
  mixed namespace never new null object or parent print private protected public readonly require
  require_once return self static string switch throw trait true try unset use var void while xor
  yield
`
    .split(/\s+/u)
    .filter((name) => name !== ''),
)

// The public properties of Eloquent's Model: `$model->exists` answers with the property, never a
// column of that name, and setting it sets the property.
const ELOQUENT_MODEL_PROPERTIES = new Set([
  'exists',
  'incrementing',
  'preventsLazyLoading',
  'timestamps',
  'usesUniqueIds',
  'wasRecentlyCreated',
])

/**
 * The cast a Prisma `Decimal` column takes: read as the string Prisma's Decimal prints. SQLite hands
 * the value back as a float, or an int where it has no fraction, and PostgreSQL and MySQL as a
 * string padded to the column's scale (`12.340000000000000000000000000000` for Prisma's default
 * `Decimal(65, 30)`).
 */
export function eloquentDecimalCast(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Database\\Eloquent\\Model;

class AsDecimal implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }
        $number = (string) $value;
        if (is_float($value) && str_contains($number, 'E')) {
            $number = number_format($value, 20, '.', '');
        }
        if (str_contains($number, '.')) {
            $number = rtrim(rtrim($number, '0'), '.');
        }

        return $number === '-0' ? '0' : $number;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return is_float($value) ? (string) $value : $value;
    }
}`
}

/**
 * The query of a model keyed by several columns (`@@id`, or with no `@id` a `@@unique`), which
 * Eloquent has no key for. A key is an array of each of the model's KEY_COLUMNS by name; a list
 * of them, or a collection of them or of models, names several rows.
 */
export function eloquentCompositeKeyBuilder(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Database\\Eloquent\\Builder;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\ModelNotFoundException;
use Illuminate\\Support\\Collection;
use InvalidArgumentException;

class CompositeKeyBuilder extends Builder
{
    public function find($id, $columns = ['*'])
    {
        return $this->isKey($id) ? $this->whereKey($id)->first($columns) : $this->findMany($id, $columns);
    }

    public function findMany($ids, $columns = ['*'])
    {
        $keys = $this->keys($ids);

        return $keys === [] ? $this->model->newCollection() : $this->whereKey($keys)->get($columns);
    }

    public function findOrFail($id, $columns = ['*'])
    {
        $result = $this->find($id, $columns);
        $keys = array_values(array_unique(array_map('json_encode', $this->keys($id))));
        $found = $result instanceof Model ? 1 : ($result === null ? 0 : count($result));
        if ($found !== count($keys)) {
            throw (new ModelNotFoundException())->setModel($this->model::class, $keys);
        }

        return $result;
    }

    public function whereKey($id)
    {
        $keys = $this->keys($id);
        if ($keys === []) {
            return $this->whereRaw('0 = 1');
        }

        return $this->where(function (Builder $query) use ($keys) {
            foreach ($keys as $key) {
                $query->orWhere(function (Builder $query) use ($key) {
                    foreach ($key as $column => $value) {
                        $query->where($this->model->qualifyColumn($column), '=', $value);
                    }
                });
            }
        });
    }

    public function whereKeyNot($id)
    {
        $keys = $this->keys($id);

        return $keys === [] ? $this : $this->whereNot(fn (Builder $query) => $query->whereKey($keys));
    }

    protected function isKey(mixed $id): bool
    {
        return $id instanceof Model || (is_array($id) && $id !== [] && ! array_is_list($id));
    }

    /** @return list<array<string, mixed>> */
    protected function keys(mixed $id): array
    {
        if ($this->isKey($id)) {
            return [$this->key($id)];
        }
        if ($id instanceof Collection) {
            $id = $id->all();
        }
        if (! is_array($id) || ! array_is_list($id)) {
            throw new InvalidArgumentException($this->refusal($id));
        }

        return array_map(fn ($key) => $this->key($key), $id);
    }

    /** @return array<string, mixed> */
    protected function key(mixed $id): array
    {
        $key = $id instanceof Model ? $id->getKey() : $id;
        $columns = $this->model::KEY_COLUMNS;
        if (! is_array($key) || count($key) !== count($columns) || array_diff($columns, array_keys($key)) !== []) {
            throw new InvalidArgumentException($this->refusal($key));
        }

        return $key;
    }

    protected function refusal(mixed $id): string
    {
        return sprintf(
            'A key of %s names every one of its columns (%s), not %s.',
            $this->model::class,
            implode(', ', $this->model::KEY_COLUMNS),
            json_encode($id),
        );
    }
}`
}

/**
 * The models of a query keyed by several columns. Eloquent's Collection keys its models by
 * `getKey()`, which is an array here: PHP casts it to the string `Array`, and every model has the
 * one key. This one keys them by the key's JSON, so unique(), diff(), intersect(), only(),
 * except(), find(), findOrFail() and fresh() tell them apart.
 */
export function eloquentCompositeKeyCollection(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Support\\Arrayable;
use Illuminate\\Database\\Eloquent\\Collection;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\ModelNotFoundException;
use Illuminate\\Support\\Arr;
use Illuminate\\Support\\Collection as BaseCollection;

class CompositeKeyCollection extends Collection
{
    public function find($key, $default = null)
    {
        if (! $this->isKeyList($key)) {
            $wanted = $this->getDictionaryKey($key);

            return Arr::first($this->items, fn (Model $model) => $this->getDictionaryKey($model) === $wanted, $default);
        }
        $wanted = $this->dictionaryKeys($key);

        return $this->filter(fn (Model $model) => in_array($this->getDictionaryKey($model), $wanted, true))->values();
    }

    public function findOrFail($key)
    {
        $result = $this->find($key);
        $wanted = $this->isKeyList($key) ? array_values(array_unique($this->dictionaryKeys($key))) : [$this->getDictionaryKey($key)];
        $found = $result instanceof Model ? 1 : ($result instanceof self ? $result->count() : 0);
        if ($found === count($wanted)) {
            return $result;
        }
        $exception = new ModelNotFoundException();
        if ($model = head($this->items)) {
            $exception->setModel($model::class, $wanted);
        }

        throw $exception;
    }

    public function fresh($with = [])
    {
        if ($this->isEmpty()) {
            return new static();
        }
        $fresh = $this->first()->newQueryWithoutScopes()
            ->with(is_string($with) ? func_get_args() : $with)
            ->whereKey($this->modelKeys())
            ->get()
            ->getDictionary();

        return $this->filter(fn (Model $model) => $model->exists && isset($fresh[$this->getDictionaryKey($model)]))
            ->map(fn (Model $model) => $fresh[$this->getDictionaryKey($model)]);
    }

    public function only($keys)
    {
        return $keys === null ? new static($this->items) : new static(array_values(Arr::only($this->getDictionary(), $this->dictionaryKeys($keys))));
    }

    public function except($keys)
    {
        return $keys === null ? new static($this->items) : new static(array_values(Arr::except($this->getDictionary(), $this->dictionaryKeys($keys))));
    }

    protected function getDictionaryKey($attribute)
    {
        if ($attribute instanceof Model) {
            $attribute = $attribute->getKey();
        }
        if (! is_array($attribute)) {
            return parent::getDictionaryKey($attribute);
        }
        ksort($attribute);

        return json_encode(array_map(fn ($value) => is_scalar($value) ? (string) $value : $value, $attribute));
    }

    protected function isKeyList(mixed $key): bool
    {
        return ! $key instanceof Model && ($key instanceof Arrayable || (is_array($key) && array_is_list($key)));
    }

    /** @return list<string> */
    protected function dictionaryKeys(mixed $keys): array
    {
        if ($keys instanceof BaseCollection) {
            $keys = $keys->all();
        } elseif ($keys instanceof Arrayable && ! $keys instanceof Model) {
            $keys = $keys->toArray();
        }

        return array_map(fn ($key) => $this->getDictionaryKey($key), $this->isKeyList($keys) ? $keys : [$keys]);
    }
}`
}

// The form a DateTime is written in, in UTC with milliseconds: what Prisma Client writes on
// SQLite, where the column is text compared as text (`…T…sss+00:00`, as its adapter turns
// `toISOString()`'s `Z` into `+00:00`); with the offset on PostgreSQL, which a `timestamp` column
// ignores and a `timestamptz` column honours whatever the session's time zone is; and without a
// zone elsewhere, as MySQL moves an offset into the session's time zone.
function dateFormat(provider: string | undefined) {
  if (provider === 'sqlite') return 'Y-m-d\\TH:i:s.vP'
  if (provider === 'postgresql' || provider === 'cockroachdb') return 'Y-m-d H:i:s.vP'
  return 'Y-m-d H:i:s.v'
}

/**
 * What a model with a DateTime uses to read and write it as Prisma Client does. Prisma keeps a
 * DateTime in UTC with milliseconds, and on SQLite, where it is text compared and sorted as text,
 * as ISO 8601 with its offset (`2030-01-01T09:00:00.000+00:00`, which the adapter writes for
 * `toISOString()`: a `Z` there would compare as other text, and `where: { at }` would miss the
 * row). Eloquent writes `Y-m-d H:i:s` in the app's timezone: under Asia/Tokyo a row would be
 * nine hours off, the milliseconds would be lost, and on SQLite a row written later the same day
 * would sort first.
 *
 * `fromDateTime()` writes Prisma's form, in UTC; a value the caller gives with no zone is read in
 * the app's timezone, as Eloquent reads one. `asDateTime()` reads a string from the table as UTC
 * where it names no zone of its own: the only strings it is handed are the table's and the ones
 * `fromDateTime()` wrote. The model's queries are a PrismaQueryBuilder, which binds a date the
 * same way, and on PostgreSQL is told the model's `timestamptz` columns, its ZONED_DATES.
 */
export function eloquentDatesTrait(namespace: string, provider?: string) {
  const zoned = provider === 'postgresql' || provider === 'cockroachdb'
  return `<?php

namespace ${namespace};

use Illuminate\\Support\\Facades\\Date;

trait PrismaDates
{
    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format(PrismaQueryBuilder::DATE_FORMAT);
    }

    protected function asDateTime($value)
    {
        return is_string($value) ? Date::parse($value, 'UTC') : parent::asDateTime($value);
    }

    protected function newBaseQueryBuilder()
    {
        $connection = $this->getConnection();
${
  zoned
    ? `        $query = new PrismaQueryBuilder($connection, $connection->getQueryGrammar(), $connection->getPostProcessor());
        $query->zonedDates = defined(static::class . '::ZONED_DATES') ? static::ZONED_DATES : [];

        return $query;`
    : `
        return new PrismaQueryBuilder($connection, $connection->getQueryGrammar(), $connection->getPostProcessor());`
}
    }
}`
}

/**
 * The query a model with a DateTime runs. Laravel binds a date in `Y-m-d H:i:s`, in the zone the
 * value has: under Asia/Tokyo a `where('placed_at', '>', now())` would compare nine hours off,
 * and on SQLite, which compares the text, it would miss rows written in Prisma's form. Every
 * binding (`where`, `whereBetween`, `whereIn`, `update`, `insert`) passes through `castBinding()`,
 * which writes a date as the models do; `whereDate()` and the other date parts take the UTC date
 * of the value, as the column holds it. On PostgreSQL a `timestamptz` column gives its date and
 * time in the session's time zone: those of the model's ZONED_DATES are taken `at time zone
 * 'UTC'`, as Prisma's own session sees them.
 */
export function eloquentQueryBuilder(namespace: string, provider?: string) {
  const zoned = provider === 'postgresql' || provider === 'cockroachdb'
  return `<?php

namespace ${namespace};

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Illuminate\\Database\\Query\\Builder;${zoned ? '\nuse Illuminate\\Database\\Query\\Expression;' : ''}

class PrismaQueryBuilder extends Builder
{
    const DATE_FORMAT = '${dateFormat(provider)}';
${
  zoned
    ? `
    /** @var list<string> */
    public array $zonedDates = [];

    protected function addDateBasedWhere($type, $column, $operator, $value, $boolean = 'and')
    {
        if (is_string($column) && in_array(last(explode('.', $column)), $this->zonedDates, true)) {
            $column = new Expression('(' . $this->grammar->wrap($column) . " at time zone 'UTC')");
        }

        return parent::addDateBasedWhere($type, $column, $operator, $value, $boolean);
    }
`
    : ''
}
    public function castBinding($value)
    {
        return $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)->setTimezone(new DateTimeZone('UTC'))->format(self::DATE_FORMAT)
            : parent::castBinding($value);
    }

    protected function flattenValue($value)
    {
        $value = parent::flattenValue($value);

        return $value instanceof DateTimeInterface
            ? DateTimeImmutable::createFromInterface($value)->setTimezone(new DateTimeZone('UTC'))
            : $value;
    }
}`
}

/**
 * The cast of a `@db.Date` column: the UTC date of the value, written `Y-m-d`, and read as
 * midnight UTC, as Prisma reads one. A date given as the text the column holds (`2030-01-02`) is
 * written as it is: read in the app's timezone, it would be the day before east of UTC.
 */
export function eloquentDateCast(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Support\\Facades\\Date;

class AsPrismaDate implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return $value === null ? null : Date::parse(substr((string) $value, 0, 10), 'UTC');
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if (is_string($value) && preg_match('/^\\d{4}-\\d{2}-\\d{2}$/', $value)) {
            return $value;
        }

        return $value === null ? null : Date::parse($value)->setTimezone('UTC')->format('Y-m-d');
    }
}`
}

/**
 * The cast of a `@db.Time` or `@db.Timetz` column: the UTC time of the value, written `H:i:s.v`,
 * and read on 1970-01-01 UTC with any offset the column gives dropped, as Prisma reads one. On
 * PostgreSQL the time is written with its offset, `+00:00`, which a `time` ignores and a `timetz`
 * keeps: without one a `timetz` takes the session's. A time given as the text the column holds
 * (`03:04:05.678`) is that time in UTC.
 */
export function eloquentTimeCast(namespace: string, provider?: string) {
  const offset = provider === 'postgresql' || provider === 'cockroachdb' ? '+00:00' : ''
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Support\\Facades\\Date;

class AsPrismaTime implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        return $value === null ? null : Date::parse('1970-01-01 ' . preg_replace('/[+-]\\d\\d(:?\\d\\d)?$/', '', (string) $value), 'UTC');
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if (is_string($value) && preg_match('/^\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?$/', $value)) {
            return $value${offset === '' ? '' : ` . '${offset}'`};
        }

        return $value === null ? null : Date::parse($value)->setTimezone('UTC')->format('H:i:s.v${offset === '' ? '' : 'P'}');
    }
}`
}

/**
 * The cast of a PostgreSQL `DateTime[]`: a list of Carbon, read from the array literal the column
 * holds as `AsPrismaDate` and `AsPrismaTime` read one value, and written as that literal in
 * UTC, each with its offset. Its argument is the native type of the items: `date` for
 * `@db.Date`, `time` for `@db.Time` and `@db.Timetz`, none for a timestamp. A string is
 * written as it is, as the literal the column takes.
 */
export function eloquentDateListCast(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Support\\Facades\\Date;

class AsPrismaDateList implements CastsAttributes
{
    public function __construct(private string $kind = 'timestamp')
    {
    }

    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }
        $items = str_getcsv(substr((string) $value, 1, -1), ',', '"', '\\\\');

        return $items === [null] || $items === [''] ? [] : array_map(fn (string $item) => match ($this->kind) {
            'date' => Date::parse(substr($item, 0, 10), 'UTC'),
            'time' => Date::parse('1970-01-01 ' . preg_replace('/[+-]\\d\\d(:?\\d\\d)?$/', '', $item), 'UTC'),
            default => Date::parse($item, 'UTC'),
        }, $items);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || is_string($value)) {
            return $value;
        }
        $format = match ($this->kind) {
            'date' => 'Y-m-d',
            'time' => 'H:i:s.vP',
            default => 'Y-m-d H:i:s.vP',
        };

        return '{' . implode(',', array_map(fn ($item) => '"' . Date::parse($item)->setTimezone('UTC')->format($format) . '"', $value)) . '}';
    }
}`
}

/**
 * The cast of a PostgreSQL scalar list other than `DateTime[]` (`String[]`, `Int[]`, an enum
 * list): a PHP list, read from the array literal the column holds (`{a,"b c",NULL}`) and written
 * as one. Without a cast Eloquent binds the array as the string `Array`, which PostgreSQL
 * refuses. Its argument is what an item reads as: `int`, `float`, `bool`, `decimal` (the string
 * `AsDecimal` reads), `bytes` (the string of its bytes, base64 in `toArray()` as `AsBytes` has
 * it), `json` (decoded as Eloquent's `array` cast decodes a `Json`), the class of an enum, or
 * none for a string. Every item is written quoted, so that none of its characters (a comma, a
 * brace, a quote, a backslash, the word NULL) is read as the literal's own; a null item is NULL,
 * and in a `Json[]` the JSON `null`. A string is written as it is, as the literal the column
 * takes.
 */
function eloquentListCast(namespace: string) {
  return `<?php

namespace ${namespace};

use Illuminate\\Contracts\\Database\\Eloquent\\CastsAttributes;
use Illuminate\\Contracts\\Database\\Eloquent\\SerializesCastableAttributes;
use Illuminate\\Database\\Eloquent\\Model;

class AsPrismaList implements CastsAttributes, SerializesCastableAttributes
{
    public function __construct(private string $type = 'string')
    {
    }

    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }
        preg_match_all('/"((?:[^"\\\\\\\\]++|\\\\\\\\.)*+)"|[^,]+/s', substr((string) $value, 1, -1), $items, PREG_SET_ORDER);

        return array_map(fn (array $item) => match (true) {
            isset($item[1]) => $this->read(preg_replace('/\\\\\\\\(.)/s', '$1', $item[1])),
            strtoupper($item[0]) === 'NULL' => null,
            default => $this->read($item[0]),
        }, $items);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || is_string($value)) {
            return $value;
        }

        return '{' . implode(',', array_map(fn ($item) => $item === null && $this->type !== 'json'
            ? 'NULL'
            : '"' . addcslashes($this->write($item), '"\\\\') . '"', $value)) . '}';
    }

    public function serialize(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        return $value === null ? null : array_map(fn ($item) => match (true) {
            $item instanceof \\BackedEnum => $item->value,
            $this->type === 'bytes' && $item !== null => base64_encode($item),
            default => $item,
        }, $value);
    }

    private function read(string $item): mixed
    {
        return match ($this->type) {
            'string' => $item,
            'int' => (int) $item,
            'float' => match ($item) {
                'NaN' => NAN,
                'Infinity' => INF,
                '-Infinity' => -INF,
                default => (float) $item,
            },
            'bool' => $item === 't',
            'decimal' => str_contains($item, '.') ? rtrim(rtrim($item, '0'), '.') : $item,
            'bytes' => str_starts_with($item, '\\\\x') ? hex2bin(substr($item, 2)) : stripcslashes($item),
            'json' => json_decode($item, true),
            default => $this->type::from($item),
        };
    }

    private function write(mixed $item): string
    {
        return match (true) {
            $item instanceof \\BackedEnum => (string) $item->value,
            $this->type === 'json' => json_encode($item),
            $this->type === 'bytes' => '\\\\x' . bin2hex((string) $item),
            $this->type === 'bool' => $item ? 'true' : 'false',
            is_float($item) && is_nan($item) => 'NaN',
            is_float($item) && is_infinite($item) => $item > 0 ? 'Infinity' : '-Infinity',
            is_float($item) => json_encode($item),
            default => (string) $item,
        };
    }
}`
}

// The classes written beside the models, each where a model needs it.
function supportClasses(models: readonly DMMF.Model[], provider: string | undefined) {
  const fields = models.flatMap((model) => model.fields.filter((f) => !f.isList))
  return [
    ...(fields.some((f) => f.type === 'DateTime')
      ? [
          {
            name: 'PrismaDates',
            why: 'the trait a model with a DateTime uses',
            code: eloquentDatesTrait,
          },
          {
            name: 'PrismaQueryBuilder',
            why: 'the query of a model with a DateTime',
            code: eloquentQueryBuilder,
          },
        ]
      : []),
    ...(fields.some((f) => f.type === 'DateTime' && f.nativeType?.[0] === 'Date')
      ? [{ name: 'AsPrismaDate', why: 'the cast of @db.Date columns', code: eloquentDateCast }]
      : []),
    ...(fields.some(
      (f) =>
        f.type === 'DateTime' && (f.nativeType?.[0] === 'Time' || f.nativeType?.[0] === 'Timetz'),
    )
      ? [{ name: 'AsPrismaTime', why: 'the cast of @db.Time columns', code: eloquentTimeCast }]
      : []),
    ...(models.some((model) => model.fields.some((f) => f.type === 'DateTime' && f.isList))
      ? [
          {
            name: 'AsPrismaDateList',
            why: 'the cast of DateTime[] columns',
            code: eloquentDateListCast,
          },
        ]
      : []),
    ...(hasArrayColumns(provider) &&
    models.some((model) => model.fields.some((f) => listCastOf(f, new Set()) !== null))
      ? [{ name: 'AsPrismaList', why: 'the cast of scalar list columns', code: eloquentListCast }]
      : []),
    ...(fields.some((f) => f.type === 'Bytes')
      ? [{ name: 'AsBytes', why: 'the cast of Bytes columns', code: eloquentBytesCast }]
      : []),
    ...(fields.some((f) => f.type === 'Decimal')
      ? [{ name: 'AsDecimal', why: 'the cast of Decimal columns', code: eloquentDecimalCast }]
      : []),
    ...(models.some((model) => modelKey(model).columns.length > 1)
      ? [
          {
            name: 'CompositeKeyBuilder',
            why: 'the query of a model keyed by several columns',
            code: eloquentCompositeKeyBuilder,
          },
          {
            name: 'CompositeKeyCollection',
            why: 'the collection of a model keyed by several columns',
            code: eloquentCompositeKeyCollection,
          },
        ]
      : []),
  ]
}

/** What is written beside the models: the casts, the trait and the query classes they name. */
export function eloquentSupportFiles(
  models: readonly DMMF.Model[],
  namespace: string,
  provider?: string,
) {
  return supportClasses(models, provider).map(({ name, code }) => ({
    fileName: `${name}.php`,
    code: code(namespace, provider),
  }))
}

/**
 * What keeps the schema from becoming Eloquent models that load and behave. Of a model or an enum:
 * a class name PHP keeps for itself (`List`, `Case`), or one that another has too once it is a
 * class, as PHP compares them without regard to case (`user_role` and `UserRole`), or that of a
 * class written beside them (`AsBytes` where a model has Bytes). Of a field: a column named after a public
 * property of Model; a relation named after a method Model has (PHP matches method names without
 * regard to case, so it would redeclare it) or after another relation of its model but for case;
 * and a relation named after a column of its own model (`$model->name` answers with the column,
 * never the relation). Each names the model and field it is on.
 */
export function eloquentProblems(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] = [],
  provider?: string,
) {
  const classes = [
    ...models.map((model) => ({
      what: 'model',
      name: model.name,
      className: makePascalCase(model.name),
    })),
    ...enums.map((enumDef) => ({ what: 'enum', name: enumDef.name, className: enumDef.name })),
  ]
  const supportByName = Map.groupBy(supportClasses(models, provider), (written) =>
    written.name.toLowerCase(),
  )
  // PHP compares class names without regard to case: the classes grouped by the name they share.
  const sameClass = Map.groupBy(classes, ({ className }) => className.toLowerCase())
  const classProblems = [
    ...classes
      .filter(({ className }) => PHP_RESERVED_CLASS_NAMES.has(className.toLowerCase()))
      .map(
        ({ what, name, className }) =>
          `${what} ${name}: PHP keeps ${className} for itself and cannot name a class after it; rename the ${what}${what === 'model' ? ' and @@map the table' : ''}`,
      ),
    ...classes.flatMap(({ what, name, className }) =>
      (supportByName.get(className.toLowerCase()) ?? []).map(
        (written) =>
          `${what} ${name}: ${written.name} is ${written.why}, written beside the models; rename the ${what}`,
      ),
    ),
    ...classes.flatMap((one) => {
      const { what, name, className } = one
      const alike = sameClass.get(className.toLowerCase()) ?? []
      return alike
        .slice(0, alike.indexOf(one))
        .map(
          (other) =>
            `${what} ${name}: its class ${className} is the class of ${other.what} ${other.name} too, as PHP compares class names without regard to case; rename one of them`,
        )
    }),
  ]
  return [
    ...classProblems,
    ...models.flatMap((model) => {
      const scalars = model.fields.filter((f) => f.kind !== 'object')
      const columns = new Set(scalars.map((f) => f.dbName ?? f.name))
      const relations = model.fields.filter((f) => f.kind === 'object')
      return [
        ...scalars
          .filter((field) => ELOQUENT_MODEL_PROPERTIES.has(field.dbName ?? field.name))
          .map(
            (field) =>
              `field ${model.name}.${field.name}: $model->${field.dbName ?? field.name} is a property of Eloquent's Model, not the column; @map the column to another name`,
          ),
        ...relations
          .filter((field) => ELOQUENT_MODEL_METHODS.has(field.name.toLowerCase()))
          .map(
            (field) =>
              `field ${model.name}.${field.name}: ${field.name}() is a method of Eloquent's Model; rename the relation field`,
          ),
        ...relations
          .filter((field, i) =>
            relations
              .slice(0, i)
              .some((other) => other.name.toLowerCase() === field.name.toLowerCase()),
          )
          .map(
            (field) =>
              `field ${model.name}.${field.name}: another relation of ${model.name} has the name but for case, and PHP would take the two methods for one; rename one of them`,
          ),
        ...relations
          .filter((field) => columns.has(field.name))
          .map(
            (field) =>
              `field ${model.name}.${field.name}: a column of ${model.name} has the name too, and $model->${field.name} would read the column; rename the relation field or @map the column`,
          ),
      ]
    }),
  ]
}

export function eloquentEnum(enumDef: DMMF.DatamodelEnum, namespace: string) {
  return [
    '<?php',
    '',
    `namespace ${namespace};`,
    '',
    ...docBlockLines(stripAnnotations(enumDef.documentation), ''),
    `enum ${enumDef.name}: string`,
    '{',
    // `class` is the one name PHP keeps from a case (`Role::class` is the enum's name): the
    // case takes an underscore, and the value stays what the database holds.
    ...enumDef.values.map(
      (v) =>
        `    case ${v.name.toLowerCase() === 'class' ? `${v.name}_` : v.name} = ${phpString(v.dbName ?? v.name)};`,
    ),
    '}',
  ].join('\n')
}

/** The models as one PHP file each, in their order. */
export function eloquentModels(
  models: readonly DMMF.Model[],
  namespace: string,
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: { readonly provider?: string } = {},
) {
  return eloquentModelCodes(models, namespace, allModels, enums, options)
    .filter(Boolean)
    .join('\n\n')
}

// Eloquent has no composite key. `$primaryKey` stays null, and KEY_COLUMNS names the columns:
// a key is an array of each by name. find(), findMany(), findOrFail(), whereKey() and
// whereKeyNot() take one through CompositeKeyBuilder, a collection of the models tells them
// apart by it through CompositeKeyCollection, destroy() and getKey() are here, and an
// update, a refresh and a delete name every column, as the row was read. Model::delete()
// refuses a model with no `$primaryKey` before it builds the query, so it is written out
// without that check.
const COMPOSITE_KEY_METHODS: readonly (readonly string[])[] = [
  [
    '    public function getKey()',
    '    {',
    '        $key = [];',
    '        foreach (static::KEY_COLUMNS as $column) {',
    '            $key[$column] = $this->getAttribute($column);',
    '        }',
    '',
    '        return $key;',
    '    }',
  ],
  [
    '    public function newEloquentBuilder($query)',
    '    {',
    '        return new CompositeKeyBuilder($query);',
    '    }',
  ],
  [
    '    public function newCollection(array $models = [])',
    '    {',
    '        return new CompositeKeyCollection($models);',
    '    }',
  ],
  [
    '    public static function destroy($ids)',
    '    {',
    '        $count = 0;',
    '        foreach ((new static())->newQuery()->whereKey(func_num_args() > 1 ? func_get_args() : $ids)->get() as $model) {',
    '            if ($model->delete()) {',
    '                $count++;',
    '            }',
    '        }',
    '',
    '        return $count;',
    '    }',
  ],
  ...['setKeysForSaveQuery', 'setKeysForSelectQuery'].map((method) => [
    `    protected function ${method}($query)`,
    '    {',
    '        foreach (static::KEY_COLUMNS as $column) {',
    "            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));",
    '        }',
    '',
    '        return $query;',
    '    }',
  ]),
  [
    '    public function delete()',
    '    {',
    '        $this->mergeAttributesFromCachedCasts();',
    '',
    '        if (! $this->exists) {',
    '            return null;',
    '        }',
    '',
    "        if ($this->fireModelEvent('deleting') === false) {",
    '            return false;',
    '        }',
    '',
    '        $this->touchOwners();',
    '        $this->performDeleteOnModel();',
    "        $this->fireModelEvent('deleted', false);",
    '',
    '        return true;',
    '    }',
  ],
]

type Ref = (fqcn: string) => string
type Timestamps = ReturnType<typeof findTimestamps>
type EloquentAssociations = ReturnType<typeof getAssociations>

/** A field's function `@default`, if it has one. */
function functionDefault(field: DMMF.Field) {
  const def = field.default
  return typeof def === 'object' && def !== null && 'name' in def ? def : undefined
}

// Laravel 12: HasUuids generates UUIDv7, HasVersion4Uuids generates
// ordered UUIDv4 (Laravel 11.35+), HasUlids generates ULIDs.
function uuidTraitOf(idField: DMMF.Field | undefined) {
  const def = idField === undefined ? undefined : functionDefault(idField)
  if (def === undefined) return null
  if (def.name === 'ulid') return 'HasUlids'
  if (def.name !== 'uuid') return null
  return 'args' in def && def.args[0] === 7 ? 'HasUuids' : 'HasVersion4Uuids'
}

function isAutoincrementKey(idField: DMMF.Field | undefined) {
  return (
    idField !== undefined &&
    (idField.type === 'Int' || idField.type === 'BigInt') &&
    functionDefault(idField)?.name === 'autoincrement'
  )
}

// A key the database makes from a dbgenerated() default (`gen_random_uuid()`) is known only
// once the row is in. Eloquent reads a key back only where the model is incrementing, and with
// the pgsql driver that insert is `insert ... returning "id"`; the other drivers ask for the
// last insert id, which is not this key. What comes back is made an integer where it reads as
// a number, so this is for a key that is one (Int, BigInt) or never reads as one (a uuid).
// CockroachDB's sequence() is an identity column on an Int or BigInt, read back the same way.
function isReturnedKey(idField: DMMF.Field | undefined, provider: string | undefined) {
  if (idField === undefined) return false
  const name = functionDefault(idField)?.name
  const isInteger = idField.type === 'Int' || idField.type === 'BigInt'
  if (name === 'sequence') return provider === 'cockroachdb' && isInteger
  return (
    (provider === 'postgresql' || provider === 'cockroachdb') &&
    name === 'dbgenerated' &&
    (isInteger || (idField.type === 'String' && idField.nativeType?.[0] === 'Uuid'))
  )
}

// A timestamp's column constant: null where the model has only the other timestamp, the column
// where it is not Laravel's own name.
function timestampConst(
  name: 'CREATED_AT' | 'UPDATED_AT',
  column: string | null,
  otherColumn: string | null,
  laravelColumn: string,
) {
  if (column === null && otherColumn !== null) return [`    const ${name} = null;`]
  return column !== null && column !== laravelColumn
    ? [`    const ${name} = ${phpString(column)};`]
    : []
}

function timestampConstLines(timestamps: Timestamps) {
  return [
    ...timestampConst(
      'CREATED_AT',
      timestamps.createdColumn,
      timestamps.updatedColumn,
      'created_at',
    ),
    ...timestampConst(
      'UPDATED_AT',
      timestamps.updatedColumn,
      timestamps.createdColumn,
      'updated_at',
    ),
  ]
}

// On PostgreSQL, the columns whose date and time PrismaQueryBuilder takes in UTC.
function zonedColumnsConst(model: DMMF.Model, provider: string | undefined) {
  if (provider !== 'postgresql' && provider !== 'cockroachdb') return []
  const zonedColumns = model.fields
    .filter((f) => f.type === 'DateTime' && !f.isList && f.nativeType?.[0] === 'Timestamptz')
    .map((f) => phpString(f.dbName ?? f.name))
  return zonedColumns.length > 0 ? [`    const ZONED_DATES = [${zonedColumns.join(', ')}];`] : []
}

const DATE_LIST_ARGUMENTS: { readonly [nativeType: string]: string } = {
  Date: " . ':date'",
  Time: " . ':time'",
  Timetz: " . ':time'",
}

// The cast of a scalar list other than DateTime[] where the column is an array: AsPrismaList,
// with what its items read as for its argument, an enum by its class as a field of one is cast.
function listCastOf(f: DMMF.Field, enumNames: ReadonlySet<string>) {
  if (!f.isList || f.type === 'DateTime' || (f.kind !== 'scalar' && f.kind !== 'enum')) return null
  if (f.kind === 'enum') {
    return enumNames.has(f.type)
      ? `AsPrismaList::class . ':' . ${f.type}::class`
      : 'AsPrismaList::class'
  }
  const item = LIST_ITEM_TYPES[f.type]?.[0]
  return item === undefined ? 'AsPrismaList::class' : `AsPrismaList::class . ':${item}'`
}

// The cast of a field that is not a list.
function castOf(f: DMMF.Field, enumNames: ReadonlySet<string>) {
  const native = f.nativeType?.[0]
  if (f.kind === 'enum' && enumNames.has(f.type)) return `${f.type}::class`
  if (f.type === 'Bytes') return 'AsBytes::class'
  if (f.type === 'Decimal') return 'AsDecimal::class'
  if (f.type === 'DateTime' && native === 'Date') return 'AsPrismaDate::class'
  if (f.type === 'DateTime' && (native === 'Time' || native === 'Timetz')) {
    return 'AsPrismaTime::class'
  }
  const cast = prismaTypeToEloquentCast(f.type)
  return cast === null ? null : `'${cast}'`
}

function castEntries(f: DMMF.Field, enumNames: ReadonlySet<string>, provider: string | undefined) {
  const column = phpString(f.dbName ?? f.name)
  // A DateTime[] is a list of Carbon, through AsPrismaDateList; its argument is the
  // native type of the items.
  if (f.isList && f.type === 'DateTime') {
    const argument = DATE_LIST_ARGUMENTS[f.nativeType?.[0] ?? ''] ?? ''
    return [`        ${column} => AsPrismaDateList::class${argument},`]
  }
  // Other Prisma scalar lists are native arrays (e.g. text[] on PostgreSQL), not serialized
  // JSON: Laravel's 'array' cast would json_decode/encode and break both reads and writes.
  // Where the column is an array they go through AsPrismaList, and elsewhere get no cast.
  if (f.isList) {
    const list = hasArrayColumns(provider) ? listCastOf(f, enumNames) : null
    return list === null ? [] : [`        ${column} => ${list},`]
  }
  const cast = castOf(f, enumNames)
  return cast === null ? [] : [`        ${column} => ${cast},`]
}

// A block of lines under a property, or no block where it has nothing to hold.
function listedBlock(open: string, entries: readonly string[]) {
  return entries.length > 0 ? [[open, ...entries, '    ];']] : []
}

type ModelKeyInfo = {
  readonly idField: DMMF.Field | undefined
  readonly pkColumn: string | null
  readonly pkUuidTrait: string | null
  readonly isAutoincrement: boolean
  readonly isReturned: boolean
  readonly compositeColumns: readonly string[]
}

function keyPropertyBlocks(key: ModelKeyInfo) {
  return [
    ...(key.pkColumn !== null && key.pkColumn !== 'id'
      ? [[`    protected $primaryKey = ${phpString(key.pkColumn)};`]]
      : []),
    ...(key.compositeColumns.length > 0 ? [['    protected $primaryKey = null;']] : []),
    ...(key.idField?.type === 'String' ? [["    protected $keyType = 'string';"]] : []),
    ...(key.isAutoincrement || key.isReturned ? [] : [['    public $incrementing = false;']]),
  ]
}

function traitLines(pkUuidTrait: string | null, writesDates: boolean, ref: Ref) {
  return [
    ...(pkUuidTrait !== null ? [`    use ${ref(`${CONCERNS}${pkUuidTrait}`)};`] : []),
    ...(writesDates ? ['    use PrismaDates;'] : []),
  ]
}

function propertyBlocks(
  model: DMMF.Model,
  ctx: EloquentContext,
  key: ModelKeyInfo,
  timestamps: Timestamps,
  attributeFields: readonly DMMF.Field[],
) {
  // A model with a DateTime reads and writes it as Prisma Client does, through PrismaDates.
  const writesDates = model.fields.some((f) => f.type === 'DateTime' && !f.isList)
  const traits = traitLines(key.pkUuidTrait, writesDates, ctx.ref)
  const constLines = [
    ...timestampConstLines(timestamps),
    ...zonedColumnsConst(model, ctx.provider),
    ...(key.compositeColumns.length > 0
      ? [`    const KEY_COLUMNS = [${key.compositeColumns.map(phpString).join(', ')}];`]
      : []),
  ]
  // A key nothing generates (cuid(), or no default at all) is the caller's to give, and a
  // `create([...])` drops what is not fillable.
  const keyGiven = key.pkColumn !== null && key.pkUuidTrait === null && !key.isAutoincrement
  const fillableColumns = [
    ...(keyGiven && key.pkColumn !== null ? [key.pkColumn] : []),
    ...attributeFields.map((f) => f.dbName ?? f.name),
  ]
  // A new model carries the schema's literal defaults before it is saved, as it will once
  // the database has filled them. A key's literal default (`@id @default(1)`) is among them:
  // the key Eloquent holds after an insert that is not incrementing is the one the model had.
  const defaultEntries = [
    ...(key.idField === undefined ? [] : [key.idField]),
    ...attributeFields,
  ].flatMap((f) => {
    const value = phpDefault(f, ctx.enums, ctx.provider)
    return value === null ? [] : [`        ${phpString(f.dbName ?? f.name)} => ${value},`]
  })
  const timestampsDisabled = timestamps.createdColumn === null && timestamps.updatedColumn === null
  return [
    ...(traits.length > 0 ? [traits] : []),
    ...(constLines.length > 0 ? [constLines] : []),
    [`    protected $table = ${phpString(model.dbName ?? model.name)};`],
    ...keyPropertyBlocks(key),
    ...(timestampsDisabled ? [['    public $timestamps = false;']] : []),
    ...listedBlock(
      '    protected $fillable = [',
      fillableColumns.map((column) => `        ${phpString(column)},`),
    ),
    ...listedBlock('    protected $attributes = [', defaultEntries),
    ...listedBlock(
      '    protected $casts = [',
      attributeFields.flatMap((f) => castEntries(f, ctx.enumNames, ctx.provider)),
    ),
  ]
}

// A uuid() or ulid() that is not the key, which the traits do not make.
function madeIdEntries(f: DMMF.Field, ref: Ref) {
  const def = functionDefault(f)
  if (f.isList || def === undefined) return []
  const column = phpString(f.dbName ?? f.name)
  if (def.name === 'ulid') return [[column, `(string) ${ref(STR)}::ulid()`]]
  if (def.name !== 'uuid') return []
  const version = 'args' in def && def.args[0] === 7 ? 'uuid7' : 'orderedUuid'
  return [[column, `(string) ${ref(STR)}::${version}()`]]
}

// A now(), and a `dbgenerated("CURRENT_TIMESTAMP")`: the table's clock is read in the
// session's time zone, and a `timestamp` column under Asia/Tokyo would be nine hours off.
function clockDefaultEntries(f: DMMF.Field) {
  const def = functionDefault(f)
  if (f.isList || f.isUpdatedAt === true || def === undefined) return []
  const clock =
    def.name === 'now' ||
    (def.name === 'dbgenerated' &&
      f.type === 'DateTime' &&
      /^(current_timestamp(\(\d*\))?|now\(\))$/iu.test(String(def.args[0] ?? '').trim()))
  return clock ? [[phpString(f.dbName ?? f.name), '$this->freshTimestamp()']] : []
}

// Prisma Client writes a ULID in upper case, and HasUlids in lower: the same column would
// hold both, and SQLite compares text by case.
function ulidMethod(ref: Ref) {
  return [
    '    public function newUniqueId()',
    '    {',
    `        return (string) ${ref(STR)}::ulid();`,
    '    }',
  ]
}

// Eloquent stamps one @updatedAt, where it would, as UPDATED_AT; the others take the same
// time unless the caller gave them one.
function timestampsMethod(extraUpdated: readonly DMMF.Field[]) {
  return [
    '    public function updateTimestamps()',
    '    {',
    ...extraUpdated.map(
      (f) =>
        `        $given${makePascalCase(f.name)} = $this->isDirty(${phpString(f.dbName ?? f.name)});`,
    ),
    '        parent::updateTimestamps();',
    ...extraUpdated.flatMap((f) => [
      `        if (! $given${makePascalCase(f.name)}) {`,
      `            $this->setAttribute(${phpString(f.dbName ?? f.name)}, $this->getAttribute($this->getUpdatedAtColumn()));`,
      '        }',
    ]),
    '',
    '        return $this;',
    '    }',
  ]
}

function saveMethod(insertLines: readonly string[]) {
  return [
    '    public function save(array $options = [])',
    '    {',
    '        if (! $this->exists) {',
    ...insertLines,
    '        }',
    '',
    '        return parent::save($options);',
    '    }',
  ]
}

function relationMethods(
  associations: EloquentAssociations,
  relationDoc: (name: string) => string[],
  ref: Ref,
) {
  const belongsToMethods = associations.belongsTo.map((a) => {
    const ownerKeyArg = a.ownerKeyColumn === null ? '' : `, ${phpString(a.ownerKeyColumn)}`
    return [
      ...relationDoc(a.name),
      `    public function ${a.name}(): ${ref(`${RELATIONS}BelongsTo`)}`,
      '    {',
      `        return $this->belongsTo(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${ownerKeyArg});`,
      '    }',
    ]
  })

  const hasOneMethods = associations.hasOne.map((a) => {
    const localKeyArg = a.localKeyColumn === null ? '' : `, ${phpString(a.localKeyColumn)}`
    return [
      ...relationDoc(a.name),
      `    public function ${a.name}(): ${ref(`${RELATIONS}HasOne`)}`,
      '    {',
      `        return $this->hasOne(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
      '    }',
    ]
  })

  const hasManyMethods = associations.hasMany.map((a) => {
    const localKeyArg = a.localKeyColumn === null ? '' : `, ${phpString(a.localKeyColumn)}`
    return [
      ...relationDoc(a.name),
      `    public function ${a.name}(): ${ref(`${RELATIONS}HasMany`)}`,
      '    {',
      `        return $this->hasMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
      '    }',
    ]
  })

  const belongsToManyMethods = associations.belongsToMany.map((a) => [
    ...relationDoc(a.name),
    `    public function ${a.name}(): ${ref(`${RELATIONS}BelongsToMany`)}`,
    '    {',
    `        return $this->belongsToMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.joinTable)}, '${a.foreignPivotKey}', '${a.relatedPivotKey}');`,
    '    }',
  ])

  return [...belongsToMethods, ...hasOneMethods, ...hasManyMethods, ...belongsToManyMethods]
}

function classImports(
  associations: EloquentAssociations,
  pkUuidTrait: string | null,
  makesIds: boolean,
  ref: Ref,
) {
  return [
    ...(pkUuidTrait !== null ? [`${CONCERNS}${pkUuidTrait}`] : []),
    MODEL,
    ...(associations.belongsTo.length > 0 ? [`${RELATIONS}BelongsTo`] : []),
    ...(associations.belongsToMany.length > 0 ? [`${RELATIONS}BelongsToMany`] : []),
    ...(associations.hasMany.length > 0 ? [`${RELATIONS}HasMany`] : []),
    ...(associations.hasOne.length > 0 ? [`${RELATIONS}HasOne`] : []),
    ...(pkUuidTrait === 'HasUlids' || makesIds ? [STR] : []),
  ].filter((fqcn) => ref(fqcn) !== `\\${fqcn}`)
}

// Eloquent reads a column through `__get`, so a field's prose is the description of its
// `@property` tag, the form IDEs and Larastan read.
function classDocOf(
  model: DMMF.Model,
  enumNames: ReadonlySet<string>,
  provider: string | undefined,
) {
  const propertyTags = model.fields.flatMap((f) => {
    const text =
      f.kind === 'scalar' || f.kind === 'enum' ? stripAnnotations(f.documentation) : undefined
    return text === undefined
      ? []
      : [`@property ${phpPropertyType(f, enumNames, provider)} $${f.dbName ?? f.name} ${text}`]
  })
  return [stripAnnotations(model.documentation), propertyTags.join('\n')]
    .filter((part) => part !== undefined && part !== '')
    .join('\n\n')
}

type EloquentContext = {
  readonly namespace: string
  readonly contextModels: readonly DMMF.Model[]
  readonly enumNames: ReadonlySet<string>
  readonly enums: readonly DMMF.DatamodelEnum[]
  readonly provider: string | undefined
  readonly ref: Ref
}

function eloquentModelCode(model: DMMF.Model, ctx: EloquentContext) {
  const { ref } = ctx
  const associations = getAssociations(model, ctx.contextModels)
  const fieldsByName = new Map(model.fields.map((f) => [f.name, f]))
  const relationDoc = (name: string) =>
    docBlockLines(stripAnnotations(fieldsByName.get(name)?.documentation), '    ')
  const modelKeyOf = modelKey(model)
  const idField = modelKeyOf.field
  const timestamps = findTimestamps(model.fields)
  const pkUuidTrait = uuidTraitOf(idField)
  const key: ModelKeyInfo = {
    idField,
    pkColumn: idField ? (idField.dbName ?? idField.name) : null,
    pkUuidTrait,
    isAutoincrement: isAutoincrementKey(idField),
    isReturned: isReturnedKey(idField, ctx.provider),
    compositeColumns: idField === undefined ? modelKeyOf.columns : [],
  }

  const attributeFields = model.fields.filter(
    (f) =>
      (f.kind === 'scalar' || f.kind === 'enum') &&
      f !== idField &&
      !timestamps.exclude.has(f.name),
  )

  // What Prisma Client fills on an insert and the table does not, or fills in another form,
  // the model fills as it saves: a uuid() or ulid() that is not the key (the traits make only
  // the key), and a now(), which Prisma Client fills from its own clock in UTC and the table
  // from the server's, on SQLite as `Y-m-d H:i:s`, which sorts before Prisma's ISO text.
  // Each is left as it is where the caller gave it. It is done in
  // save(), not in a `creating` listener, which Eloquent drops without an event dispatcher
  // (Capsule outside Laravel).
  const madeIds = attributeFields.flatMap((f) => madeIdEntries(f, ref))
  const clockDefaults = attributeFields.flatMap(clockDefaultEntries)
  const insertLines = [...madeIds, ...clockDefaults].flatMap(([column, value]) => [
    `            if (! array_key_exists(${column}, $this->attributes)) {`,
    `                $this->setAttribute(${column}, ${value});`,
    '            }',
  ])
  const extraUpdated = attributeFields.filter((f) => f.isUpdatedAt === true)
  const methodBlocks = [
    ...(insertLines.length > 0 ? [saveMethod(insertLines)] : []),
    ...(extraUpdated.length > 0 ? [timestampsMethod(extraUpdated)] : []),
    ...(pkUuidTrait === 'HasUlids' ? [ulidMethod(ref)] : []),
    ...(key.compositeColumns.length > 0 ? COMPOSITE_KEY_METHODS : []),
    ...relationMethods(associations, relationDoc, ref),
  ]

  const bodyBlocks = [
    ...propertyBlocks(model, ctx, key, timestamps, attributeFields),
    ...methodBlocks,
  ]
  const classDoc = classDocOf(model, ctx.enumNames, ctx.provider)

  const lines = [
    '<?php',
    '',
    `namespace ${ctx.namespace};`,
    '',
    ...classImports(associations, pkUuidTrait, madeIds.length > 0, ref).map(
      (fqcn) => `use ${fqcn};`,
    ),
    '',
    ...docBlockLines(classDoc === '' ? undefined : classDoc, ''),
    `class ${makePascalCase(model.name)} extends ${ref(MODEL)}`,
    '{',
    // oxlint-disable-next-line oxc/no-map-spread -- one blank separator per block, not an accumulator
    ...bodyBlocks.flatMap((block, i) => (i === 0 ? block : ['', ...block])),
    '}',
  ]

  return lines.join('\n')
}

/**
 * The PHP class of each model, in the order of `models`. What every class reads of the schema —
 * which short names are taken — is worked out once for them all.
 */
export function eloquentModelCodes(
  models: readonly DMMF.Model[],
  namespace: string,
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  options: { readonly provider?: string } = {},
) {
  const contextModels = allModels ?? models
  const enumNames = new Set((enums ?? []).map((e) => e.name))
  // Laravel's classes are imported by their short names, but where a model or enum of this
  // namespace has one (PHP compares class names without regard to case), the short name is the
  // model's and Laravel's class is written in full.
  const taken = new Set(
    [
      ...contextModels.map((m) => makePascalCase(m.name)),
      ...enumNames,
      ...supportClasses(contextModels, options.provider).map((written) => written.name),
    ].map((name) => name.toLowerCase()),
  )
  const ref = (fqcn: string) => {
    const short = fqcn.slice(fqcn.lastIndexOf('\\') + 1)
    return taken.has(short.toLowerCase()) ? `\\${fqcn}` : short
  }
  const ctx: EloquentContext = {
    namespace,
    contextModels,
    enumNames,
    enums: enums ?? [],
    provider: options.provider,
    ref,
  }
  return models.map((model) => eloquentModelCode(model, ctx))
}
