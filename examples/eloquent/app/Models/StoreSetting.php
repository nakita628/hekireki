<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A table as `prisma db pull` names it: lower case and snake case, and no @id, only a unique key.
 * Two @updatedAt: Eloquent keeps one as UPDATED_AT, and Prisma bumps both.
 */
class StoreSetting extends Model
{
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
}