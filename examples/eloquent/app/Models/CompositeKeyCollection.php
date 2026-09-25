<?php

namespace App\Models;

use Illuminate\Contracts\Support\Arrayable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection as BaseCollection;

/**
 * The models of a query keyed by several columns. Eloquent's Collection keys its models by
 * getKey(), an array here, which PHP casts to the string `Array`: every model would have the one
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
}