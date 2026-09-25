<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * The query of a model keyed by several columns. A key is an array of every one of its
 * KEY_COLUMNS by name (`['order_number' => 1, 'product_id' => 'p1']`); a list of keys, or a
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
}