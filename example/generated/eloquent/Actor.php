<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Actor extends Model
{
    protected $table = 'Actor';

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    public function films(): BelongsToMany
    {
        return $this->belongsToMany(Film::class, '_cast', 'A', 'B');
    }
}