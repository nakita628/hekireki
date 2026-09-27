<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class StoreSetting extends Model
{
    use PrismaDates;

    const CREATED_AT = null;

    protected $table = 'store_setting';

    protected $primaryKey = 'key';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'key',
        'value',
        'synced_at',
    ];

    protected $casts = [
        'synced_at' => 'datetime',
    ];

    public function updateTimestamps()
    {
        $givenSyncedAt = $this->isDirty('synced_at');
        parent::updateTimestamps();
        if (! $givenSyncedAt) {
            $this->setAttribute('synced_at', $this->getAttribute($this->getUpdatedAtColumn()));
        }

        return $this;
    }
}