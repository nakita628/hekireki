<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Named implicit many-to-many: the join table is `_cast`,
 * not `_ActorToFilm`.
 */
class Actor extends Model
{
    protected $table = 'actor';

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    public function films(): BelongsToMany
    {
        return $this->belongsToMany(Film::class, '_cast', 'A', 'B');
    }
}