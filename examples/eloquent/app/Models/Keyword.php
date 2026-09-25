<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Column names that are words of PHP. A doc comment that ends a PHPDoc block early: *\/ and a
 * $variable PHP would not interpolate in a comment anyway.
 */
class Keyword extends Model
{
    protected $table = 'keywords';

    public $timestamps = false;

    protected $fillable = [
        'type',
        'class',
        'function',
        'match',
        'list',
        'static',
    ];

    protected $casts = [
        'static' => 'boolean',
    ];
}