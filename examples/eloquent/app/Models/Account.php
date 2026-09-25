<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Someone who signs in. The key counts up in the database, the address is unique, and the
 * timestamps are Laravel's own columns under Prisma's field names.
 */
class Account extends Model
{
    protected $table = 'accounts';

    protected $fillable = [
        'email_address',
        'handle',
        'display_name',
        'role',
        'active',
    ];

    protected $attributes = [
        'role' => 'customer',
        'active' => true,
    ];

    protected $casts = [
        'role' => Role::class,
        'active' => 'boolean',
    ];

    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format('Y-m-d\TH:i:s.v\Z');
    }

    protected function asDateTime($value)
    {
        if (is_string($value) && preg_match('/^\d{4}-\d\d-\d\d[ T][\d:.]+$/', $value)) {
            $value .= '+00:00';
        }

        return parent::asDateTime($value);
    }

    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class, 'account_id');
    }

    public function wishlist(): HasOne
    {
        return $this->hasOne(Wishlist::class, 'account_id');
    }

    public function orders(): HasMany
    {
        return $this->hasMany(Order::class, 'account_id');
    }

    public function gifts(): HasMany
    {
        return $this->hasMany(Order::class, 'gift_for', 'handle');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'account_id');
    }

    public function followers(): BelongsToMany
    {
        return $this->belongsToMany(Account::class, '_Follows', 'A', 'B');
    }

    public function following(): BelongsToMany
    {
        return $this->belongsToMany(Account::class, '_Follows', 'B', 'A');
    }
}