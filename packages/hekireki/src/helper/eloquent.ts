import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, stripAnnotations } from '../utils/index.js'
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

// A doc comment as a PHPDoc block, or nothing. A `*/` in the text would end the block: it is
// written `*\/`.
function phpDoc(documentation: string | undefined) {
  const doc = stripAnnotations(documentation)
  return doc
    ? ['/**', ...doc.split('\n').map((line) => ` * ${line.replaceAll('*/', '*\\/')}`), ' */']
    : []
}

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

/**
 * What Eloquent keys a model by: its `@id`, or its `@@id`, or where it has neither, the first
 * unique of required fields (Prisma requires a model without an id to have one). One field is
 * `$primaryKey`; several are named column by column, as Eloquent has no composite key.
 */
function modelKey(model: DMMF.Model) {
  const id = model.fields.find((f) => f.isId)
  const required = (names: readonly string[]) =>
    names.every((name) => model.fields.find((f) => f.name === name)?.isRequired)
  const names = id
    ? [id.name]
    : model.primaryKey && model.primaryKey.fields.length > 0
      ? model.primaryKey.fields
      : ([
          ...model.fields.filter((f) => f.isUnique).map((f) => [f.name]),
          ...model.uniqueFields,
        ].find(required) ?? [])
  return {
    field: names.length === 1 ? model.fields.find((f) => f.name === names[0]) : undefined,
    columns: names.map((name) => fieldColumn(model, name)),
  }
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    ownerKeyColumn: string | null
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    localKeyColumn: string | null
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    localKeyColumn: string | null
  }[] = []
  const belongsToMany: {
    name: string
    targetModel: string
    joinTable: string
    foreignPivotKey: string
    relatedPivotKey: string
  }[] = []

  // A key column is written out only where it is not the key Eloquent would take, the related
  // model's own for a belongsTo and this one's for a hasOne or hasMany.
  const ownKeyColumns = modelKey(model).columns
  const ownKey = ownKeyColumns.length === 1 ? ownKeyColumns[0] : null
  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    // Eloquent has no composite-key relations: emitting one would silently
    // half-join on the first column, so composite FKs produce no relation
    // method (the scalar columns themselves are still generated).
    if (field.relationFromFields && field.relationFromFields.length > 1) continue
    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const targetModel = allModels.find((m) => m.name === field.type)
      const referencedField = field.relationToFields?.[0] ?? 'id'
      const ownerKeyColumn = targetModel
        ? fieldColumn(targetModel, referencedField)
        : referencedField
      const targetKey = targetModel ? modelKey(targetModel).columns : ['id']
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn: fieldColumn(model, field.relationFromFields[0]),
        ownerKeyColumn:
          targetKey.length === 1 && targetKey[0] === ownerKeyColumn ? null : ownerKeyColumn,
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      // A self relation has both of its fields on this model: the other side is not this one.
      const otherSide = targetModel.fields.find(
        (f) => f !== field && f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        // Prisma's join table holds the model that sorts first in "A". A model related to itself
        // is on both sides: the relation field whose name sorts first reads its own key from "A".
        const ownIsA =
          model.name === field.type ? field.name < otherSide.name : model.name < field.type
        const [left, right] = ownIsA ? [model.name, field.type] : [field.type, model.name]
        belongsToMany.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignPivotKey: ownIsA ? 'A' : 'B',
          relatedPivotKey: ownIsA ? 'B' : 'A',
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
    if ((fkField?.relationFromFields?.length ?? 0) > 1) continue
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!foreignKey) continue
    const foreignKeyColumn = fieldColumn(targetModel, foreignKey)
    const referencedColumn = fieldColumn(model, fkField?.relationToFields?.[0] ?? 'id')
    const localKeyColumn = referencedColumn === ownKey ? null : referencedColumn

    if (field.isList) {
      hasMany.push({ name: field.name, targetModel: field.type, foreignKeyColumn, localKeyColumn })
    } else {
      hasOne.push({ name: field.name, targetModel: field.type, foreignKeyColumn, localKeyColumn })
    }
  }

  return { belongsTo, hasMany, hasOne, belongsToMany }
}

function findTimestamps(fields: readonly DMMF.Field[]) {
  const createdAliases = new Set(['created_at', 'createdAt'])
  const updatedAliases = new Set(['updated_at', 'updatedAt', 'modified_at', 'modifiedAt'])

  const created = fields.find((f) => f.type === 'DateTime' && createdAliases.has(f.name))
  const updated =
    fields.find((f) => f.isUpdatedAt) ??
    fields.find((f) => f.type === 'DateTime' && updatedAliases.has(f.name))

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
function phpDefault(
  field: DMMF.Field,
  enums: readonly DMMF.DatamodelEnum[],
  provider: string | undefined,
) {
  const def = field.default
  if (def === undefined || def === null || field.isList || typeof def === 'object') return null
  if (field.kind === 'enum') {
    const member = enums.find((e) => e.name === field.type)?.values.find((v) => v.name === def)
    return member ? phpString(member.dbName ?? member.name) : null
  }
  if (typeof def === 'boolean') return String(def)
  if (typeof def === 'number') {
    if (field.type === 'Decimal') return phpString(String(def))
    return field.type === 'Float' && Number.isInteger(def) ? `${def}.0` : String(def)
  }
  // DMMF carries BigInt defaults as digit strings and DateTime literals as ISO strings.
  if (field.type === 'BigInt') return def
  if (field.type === 'DateTime') {
    const iso = new Date(def).toISOString()
    if (field.nativeType?.[0] === 'Date') return phpString(iso.slice(0, 10))
    if (field.nativeType?.[0] === 'Time' || field.nativeType?.[0] === 'Timetz') {
      return phpString(iso.slice(11, 23))
    }
    if (provider === 'sqlite') return phpString(iso.replace('Z', '+00:00'))
    const naive = iso.slice(0, 23).replace('T', ' ')
    return phpString(
      provider === 'postgresql' || provider === 'cockroachdb' ? `${naive}+00:00` : naive,
    )
  }
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

/**
 * A Prisma Bytes column: written as a stream, which PDO binds as a LOB, read back as the string of
 * its bytes, and serialized as base64.
 */
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

/**
 * A Prisma Decimal column, read as the string Prisma's Decimal prints: no float, and no zeros a
 * column's scale pads it with.
 */
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

/**
 * The query of a model keyed by several columns. A key is an array of every one of its
 * KEY_COLUMNS by name (\`['order_number' => 1, 'product_id' => 'p1']\`); a list of keys, or a
 * collection of keys or of models, names several rows. find(), findMany(), findOrFail(),
 * whereKey() and whereKeyNot() take either, and refuse a key that leaves a column out, which
 * would reach every row the rest of it matches.
 */
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

/**
 * The models of a query keyed by several columns. Eloquent's Collection keys its models by
 * getKey(), an array here, which PHP casts to the string \`Array\`: every model would have the one
 * key. This one keys them by the key's JSON, its columns in order and its values as strings, so
 * unique(), diff(), intersect(), only(), except(), find(), findOrFail() and fresh() tell them
 * apart, and take a key as CompositeKeyBuilder does.
 */
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

    /** A list of keys, or of models: a key alone is an array of its columns by name. */
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

/**
 * A DateTime as Prisma Client keeps it: in UTC with milliseconds, in PrismaQueryBuilder's
 * DATE_FORMAT. A value the caller gives with no zone is in the app's timezone, as Eloquent reads
 * one; one the table holds with no zone is UTC, as Prisma wrote it. The model's queries bind a
 * date the same way.
 */
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

/**
 * The query of a model with a DateTime: a date is bound as Prisma Client writes one, in UTC with
 * milliseconds, and whereDate() and the other date parts take its UTC date.
 */
class PrismaQueryBuilder extends Builder
{
    const DATE_FORMAT = '${dateFormat(provider)}';
${
  zoned
    ? `
    /** @var list<string> the model's timestamptz columns, whose date and time are taken in UTC */
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

/**
 * A @db.Date column, as Prisma Client keeps one: the UTC date of the value, read as midnight UTC.
 * A date given as \`Y-m-d\` is written as it is; any other value with no zone is in the app's
 * timezone.
 */
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

/**
 * A @db.Time or @db.Timetz column, as Prisma Client keeps one: the UTC time of the value, read on
 * 1970-01-01 UTC, the offset a timetz gives dropped. A time given as \`H:i:s\` is that time in
 * UTC; any other value with no zone is in the app's timezone.
 */
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

/**
 * A PostgreSQL DateTime[] column, as Prisma Client keeps one: a list of Carbon, written as the
 * array literal in UTC. Its argument is the type of the items: date, time, or none for a
 * timestamp. A string is written as it is, as the literal the column takes.
 */
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

// The classes written beside the models, each where a model needs it.
function supportClasses(models: readonly DMMF.Model[]) {
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
  return supportClasses(models).map(({ name, code }) => ({
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
) {
  const classes = [
    ...models.map((model) => ({
      what: 'model',
      name: model.name,
      className: makePascalCase(model.name),
    })),
    ...enums.map((enumDef) => ({ what: 'enum', name: enumDef.name, className: enumDef.name })),
  ]
  const support = supportClasses(models)
  const classProblems = [
    ...classes
      .filter(({ className }) => PHP_RESERVED_CLASS_NAMES.has(className.toLowerCase()))
      .map(
        ({ what, name, className }) =>
          `${what} ${name}: PHP keeps ${className} for itself and cannot name a class after it; rename the ${what}${what === 'model' ? ' and @@map the table' : ''}`,
      ),
    ...classes.flatMap(({ what, name, className }) =>
      support
        .filter((written) => written.name.toLowerCase() === className.toLowerCase())
        .map(
          (written) =>
            `${what} ${name}: ${written.name} is ${written.why}, written beside the models; rename the ${what}`,
        ),
    ),
    ...classes.flatMap(({ what, name, className }, i) =>
      classes
        .slice(0, i)
        .filter((other) => other.className.toLowerCase() === className.toLowerCase())
        .map(
          (other) =>
            `${what} ${name}: its class ${className} is the class of ${other.what} ${other.name} too, as PHP compares class names without regard to case; rename one of them`,
        ),
    ),
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
    ...phpDoc(enumDef.documentation),
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

export function eloquentModels(
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
      ...supportClasses(contextModels).map((written) => written.name),
    ].map((name) => name.toLowerCase()),
  )
  const ref = (fqcn: string) => {
    const short = fqcn.slice(fqcn.lastIndexOf('\\') + 1)
    return taken.has(short.toLowerCase()) ? `\\${fqcn}` : short
  }
  return models
    .map((model) => {
      const associations = getAssociations(model, contextModels)
      const tableName = model.dbName ?? model.name
      const key = modelKey(model)
      const idField = key.field
      const timestamps = findTimestamps(model.fields)
      // A model with a DateTime reads and writes it as Prisma Client does, through PrismaDates.
      const writesDates = model.fields.some((f) => f.type === 'DateTime' && !f.isList)

      const pkColumn = idField ? (idField.dbName ?? idField.name) : null
      const pkUuidTrait = (() => {
        const def = idField?.default
        if (!(def && typeof def === 'object' && 'name' in def)) return null
        // Laravel 12: HasUuids generates UUIDv7, HasVersion4Uuids generates
        // ordered UUIDv4 (Laravel 11.35+), HasUlids generates ULIDs.
        if (def.name === 'ulid') return 'HasUlids'
        if (def.name !== 'uuid') return null
        return 'args' in def && def.args[0] === 7 ? 'HasUuids' : 'HasVersion4Uuids'
      })()
      const pkDefault = idField?.default
      const isAutoincrement =
        idField !== undefined &&
        (idField.type === 'Int' || idField.type === 'BigInt') &&
        pkDefault !== undefined &&
        pkDefault !== null &&
        typeof pkDefault === 'object' &&
        'name' in pkDefault &&
        pkDefault.name === 'autoincrement'

      const timestampConstLines = [
        ...(timestamps.createdColumn === null && timestamps.updatedColumn !== null
          ? ['    const CREATED_AT = null;']
          : timestamps.createdColumn !== null && timestamps.createdColumn !== 'created_at'
            ? [`    const CREATED_AT = ${phpString(timestamps.createdColumn)};`]
            : []),
        ...(timestamps.updatedColumn === null && timestamps.createdColumn !== null
          ? ['    const UPDATED_AT = null;']
          : timestamps.updatedColumn !== null && timestamps.updatedColumn !== 'updated_at'
            ? [`    const UPDATED_AT = ${phpString(timestamps.updatedColumn)};`]
            : []),
      ]
      const timestampsDisabled =
        timestamps.createdColumn === null && timestamps.updatedColumn === null

      const attributeFields = model.fields.filter(
        (f) =>
          (f.kind === 'scalar' || f.kind === 'enum') &&
          f !== idField &&
          !timestamps.exclude.has(f.name),
      )

      // A key nothing generates (cuid(), or no default at all) is the caller's to give, and a
      // `create([...])` drops what is not fillable.
      const keyGiven = pkColumn !== null && pkUuidTrait === null && !isAutoincrement
      const fillableColumns = [
        ...(keyGiven && pkColumn !== null ? [pkColumn] : []),
        ...attributeFields.map((f) => f.dbName ?? f.name),
      ]
      const fillableLines =
        fillableColumns.length > 0
          ? [
              '    protected $fillable = [',
              ...fillableColumns.map((column) => `        ${phpString(column)},`),
              '    ];',
            ]
          : []

      // A new model carries the schema's literal defaults before it is saved, as it will once
      // the database has filled them.
      const defaultEntries = attributeFields.flatMap((f) => {
        const value = phpDefault(f, enums ?? [], options.provider)
        return value === null ? [] : [`        ${phpString(f.dbName ?? f.name)} => ${value},`]
      })
      const defaultLines =
        defaultEntries.length > 0
          ? ['    protected $attributes = [', ...defaultEntries, '    ];']
          : []

      // Eloquent has no composite key. `$primaryKey` stays null, and KEY_COLUMNS names the columns:
      // a key is an array of each by name. find(), findMany(), findOrFail(), whereKey() and
      // whereKeyNot() take one through CompositeKeyBuilder, a collection of the models tells them
      // apart by it through CompositeKeyCollection, destroy() and getKey() are here, and an
      // update, a refresh and a delete name every column, as the row was read. Model::delete()
      // refuses a model with no `$primaryKey` before it builds the query, so it is written out
      // without that check.
      const compositeColumns = idField === undefined ? key.columns : []
      const compositeKeyMethods = [
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

      // On PostgreSQL, the columns whose date and time PrismaQueryBuilder takes in UTC.
      const zonedColumns =
        options.provider === 'postgresql' || options.provider === 'cockroachdb'
          ? model.fields
              .filter(
                (f) => f.type === 'DateTime' && !f.isList && f.nativeType?.[0] === 'Timestamptz',
              )
              .map((f) => phpString(f.dbName ?? f.name))
          : []
      const constLines = [
        ...timestampConstLines,
        ...(zonedColumns.length > 0
          ? [`    const ZONED_DATES = [${zonedColumns.join(', ')}];`]
          : []),
        ...(compositeColumns.length > 0
          ? [`    const KEY_COLUMNS = [${compositeColumns.map(phpString).join(', ')}];`]
          : []),
      ]

      const castEntries = attributeFields.flatMap((f) => {
        const column = f.dbName ?? f.name
        // A DateTime[] is a list of Carbon, through AsPrismaDateList; its argument is the
        // native type of the items.
        if (f.isList && f.type === 'DateTime') {
          const kind = f.nativeType?.[0]
          const argument =
            kind === 'Date'
              ? " . ':date'"
              : kind === 'Time' || kind === 'Timetz'
                ? " . ':time'"
                : ''
          return [`        ${phpString(column)} => AsPrismaDateList::class${argument},`]
        }
        // Other Prisma scalar lists are native arrays (e.g. text[] on PostgreSQL),
        // not serialized JSON: Laravel's 'array' cast would json_decode/encode
        // and break both reads and writes, so they get no cast.
        if (f.isList) return []
        if (f.kind === 'enum' && enumNames.has(f.type)) {
          return [`        ${phpString(column)} => ${f.type}::class,`]
        }
        if (f.type === 'Bytes') return [`        ${phpString(column)} => AsBytes::class,`]
        if (f.type === 'Decimal') return [`        ${phpString(column)} => AsDecimal::class,`]
        if (f.type === 'DateTime' && f.nativeType?.[0] === 'Date') {
          return [`        ${phpString(column)} => AsPrismaDate::class,`]
        }
        if (
          f.type === 'DateTime' &&
          (f.nativeType?.[0] === 'Time' || f.nativeType?.[0] === 'Timetz')
        ) {
          return [`        ${phpString(column)} => AsPrismaTime::class,`]
        }
        const cast = prismaTypeToEloquentCast(f.type)
        return cast ? [`        ${phpString(column)} => '${cast}',`] : []
      })

      const castLines =
        castEntries.length > 0 ? ['    protected $casts = [', ...castEntries, '    ];'] : []

      const propertyBlocks = [
        ...(pkUuidTrait !== null || writesDates
          ? [
              [
                ...(pkUuidTrait !== null ? [`    use ${ref(`${CONCERNS}${pkUuidTrait}`)};`] : []),
                ...(writesDates ? ['    use PrismaDates;'] : []),
              ],
            ]
          : []),
        ...(constLines.length > 0 ? [constLines] : []),
        [`    protected $table = ${phpString(tableName)};`],
        ...(pkColumn !== null && pkColumn !== 'id'
          ? [[`    protected $primaryKey = ${phpString(pkColumn)};`]]
          : []),
        ...(compositeColumns.length > 0 ? [['    protected $primaryKey = null;']] : []),
        ...(idField?.type === 'String' ? [["    protected $keyType = 'string';"]] : []),
        ...(isAutoincrement ? [] : [['    public $incrementing = false;']]),
        ...(timestampsDisabled ? [['    public $timestamps = false;']] : []),
        ...(fillableLines.length > 0 ? [fillableLines] : []),
        ...(defaultLines.length > 0 ? [defaultLines] : []),
        ...(castLines.length > 0 ? [castLines] : []),
      ]

      const belongsToMethods = associations.belongsTo.map((a) => {
        const ownerKeyArg = a.ownerKeyColumn === null ? '' : `, ${phpString(a.ownerKeyColumn)}`
        return [
          `    public function ${a.name}(): ${ref(`${RELATIONS}BelongsTo`)}`,
          '    {',
          `        return $this->belongsTo(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${ownerKeyArg});`,
          '    }',
        ]
      })

      const hasOneMethods = associations.hasOne.map((a) => {
        const localKeyArg = a.localKeyColumn === null ? '' : `, ${phpString(a.localKeyColumn)}`
        return [
          `    public function ${a.name}(): ${ref(`${RELATIONS}HasOne`)}`,
          '    {',
          `        return $this->hasOne(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
          '    }',
        ]
      })

      const hasManyMethods = associations.hasMany.map((a) => {
        const localKeyArg = a.localKeyColumn === null ? '' : `, ${phpString(a.localKeyColumn)}`
        return [
          `    public function ${a.name}(): ${ref(`${RELATIONS}HasMany`)}`,
          '    {',
          `        return $this->hasMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.foreignKeyColumn)}${localKeyArg});`,
          '    }',
        ]
      })

      const belongsToManyMethods = associations.belongsToMany.map((a) => [
        `    public function ${a.name}(): ${ref(`${RELATIONS}BelongsToMany`)}`,
        '    {',
        `        return $this->belongsToMany(${makePascalCase(a.targetModel)}::class, ${phpString(a.joinTable)}, '${a.foreignPivotKey}', '${a.relatedPivotKey}');`,
        '    }',
      ])

      // Prisma Client writes a ULID in upper case, and HasUlids in lower: the same column would
      // hold both, and SQLite compares text by case.
      const ulidMethod = [
        '    public function newUniqueId()',
        '    {',
        `        return (string) ${ref(STR)}::ulid();`,
        '    }',
      ]
      // What Prisma Client fills on an insert and the table does not, or fills in another form,
      // the model fills as it saves: a uuid() or ulid() that is not the key (the traits make only
      // the key), and a now(), which Prisma Client fills from its own clock in UTC and the table
      // from the server's, on SQLite as `Y-m-d H:i:s`, which sorts before Prisma's ISO text.
      // Each is left as it is where the caller gave it. It is done in
      // save(), not in a `creating` listener, which Eloquent drops without an event dispatcher
      // (Capsule outside Laravel).
      const madeIds = attributeFields.flatMap((f) => {
        const def = f.default
        if (f.isList || !(def && typeof def === 'object' && 'name' in def)) return []
        const column = phpString(f.dbName ?? f.name)
        if (def.name === 'ulid') return [[column, `(string) ${ref(STR)}::ulid()`]]
        if (def.name !== 'uuid') return []
        const version = 'args' in def && def.args[0] === 7 ? 'uuid7' : 'orderedUuid'
        return [[column, `(string) ${ref(STR)}::${version}()`]]
      })
      // A `dbgenerated("CURRENT_TIMESTAMP")` is filled so too: the table's clock is read in the
      // session's time zone, and a `timestamp` column under Asia/Tokyo would be nine hours off.
      const clockDefaults = attributeFields.flatMap((f) => {
        const def = f.default
        if (f.isList || f.isUpdatedAt || !(def && typeof def === 'object' && 'name' in def)) {
          return []
        }
        const clock =
          def.name === 'now' ||
          (def.name === 'dbgenerated' &&
            f.type === 'DateTime' &&
            /^(current_timestamp(\(\d*\))?|now\(\))$/iu.test(String(def.args[0] ?? '').trim()))
        return clock ? [[phpString(f.dbName ?? f.name), '$this->freshTimestamp()']] : []
      })
      const insertLines = [...madeIds, ...clockDefaults].flatMap(([column, value]) => [
        `            if (! array_key_exists(${column}, $this->attributes)) {`,
        `                $this->setAttribute(${column}, ${value});`,
        '            }',
      ])
      // Eloquent stamps one @updatedAt, where it would, as UPDATED_AT; the others take the same
      // time unless the caller gave them one.
      const extraUpdated = attributeFields.filter((f) => f.isUpdatedAt)
      const timestampsMethod = [
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
      const saveMethod = [
        '    public function save(array $options = [])',
        '    {',
        '        if (! $this->exists) {',
        ...insertLines,
        '        }',
        '',
        '        return parent::save($options);',
        '    }',
      ]
      const methodBlocks = [
        ...(insertLines.length > 0 ? [saveMethod] : []),
        ...(extraUpdated.length > 0 ? [timestampsMethod] : []),
        ...(pkUuidTrait === 'HasUlids' ? [ulidMethod] : []),
        ...(compositeColumns.length > 0 ? compositeKeyMethods : []),
        ...belongsToMethods,
        ...hasOneMethods,
        ...hasManyMethods,
        ...belongsToManyMethods,
      ]

      const imports = [
        ...(pkUuidTrait !== null ? [`${CONCERNS}${pkUuidTrait}`] : []),
        MODEL,
        ...(associations.belongsTo.length > 0 ? [`${RELATIONS}BelongsTo`] : []),
        ...(associations.belongsToMany.length > 0 ? [`${RELATIONS}BelongsToMany`] : []),
        ...(associations.hasMany.length > 0 ? [`${RELATIONS}HasMany`] : []),
        ...(associations.hasOne.length > 0 ? [`${RELATIONS}HasOne`] : []),
        ...(pkUuidTrait === 'HasUlids' || madeIds.length > 0 ? [STR] : []),
      ].filter((fqcn) => ref(fqcn) !== `\\${fqcn}`)

      const bodyBlocks = [...propertyBlocks, ...methodBlocks]

      const lines = [
        '<?php',
        '',
        `namespace ${namespace};`,
        '',
        ...imports.map((fqcn) => `use ${fqcn};`),
        '',
        ...phpDoc(model.documentation),
        `class ${makePascalCase(model.name)} extends ${ref(MODEL)}`,
        '{',
        // oxlint-disable-next-line oxc/no-map-spread -- one blank separator per block, not an accumulator
        ...bodyBlocks.flatMap((block, i) => (i === 0 ? block : ['', ...block])),
        '}',
      ]

      return lines.join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
