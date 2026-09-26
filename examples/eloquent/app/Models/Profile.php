<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One per account, deleted with it (1-1, the foreign key unique on this side). No timestamps.
 */
class Profile extends Model
{
    protected $table = 'profiles';

    public $timestamps = false;

    protected $fillable = [
        'account_id',
        'bio',
        'avatar',
        'mood',
    ];

    protected $casts = [
        'account_id' => 'integer',
        'avatar' => AsBytes::class,
        'mood' => Mood::class,
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class, 'account_id');
    }
}