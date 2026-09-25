import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  eloquentBytesCast,
  eloquentEnum,
  eloquentModels,
  eloquentProblems,
  eloquentSupportFiles,
  prismaTypeToEloquentCast,
} from './eloquent.js'

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

describe('prismaTypeToEloquentCast', () => {
  it.each([
    ['Int', 'integer'],
    ['BigInt', 'integer'],
    ['Float', 'float'],
    ['Boolean', 'boolean'],
    ['DateTime', 'datetime'],
    ['Json', 'array'],
    ['String', null],
    ['Decimal', null],
    ['Bytes', null],
  ])('maps %s to %s', (prismaType, expected) => {
    expect(prismaTypeToEloquentCast(prismaType)).toBe(expected)
  })
})

describe('eloquentEnum', () => {
  it('generates a string-backed PHP enum', () => {
    const enumDef: DMMF.DatamodelEnum = {
      name: 'Role',
      values: [
        { name: 'ADMIN', dbName: null },
        { name: 'USER', dbName: null },
      ],
      dbName: null,
    }

    expect(eloquentEnum(enumDef, 'App\\Models')).toBe(`<?php

namespace App\\Models;

enum Role: string
{
    case ADMIN = 'ADMIN';
    case USER = 'USER';
}`)
  })

  it('uses @map database names as enum case values', () => {
    const enumDef: DMMF.DatamodelEnum = {
      name: 'Status',
      values: [
        { name: 'ACTIVE', dbName: 'active' },
        { name: 'INACTIVE', dbName: 'inactive' },
      ],
      dbName: null,
    }

    expect(eloquentEnum(enumDef, 'App\\Models')).toBe(`<?php

namespace App\\Models;

enum Status: string
{
    case ACTIVE = 'active';
    case INACTIVE = 'inactive';
}`)
  })
})

describe('eloquentModels', () => {
  it('generates hasMany and belongsTo for a one-to-many relation with uuid primary key', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'title', type: 'String' }),
        makeField({ name: 'userId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models', [user, post])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'User';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class, 'userId');
    }
}`)

    expect(eloquentModels([post], 'App\\Models', [user, post])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Post extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Post';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'title',
        'userId',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }
}`)
  })

  it('keeps default incrementing behavior for autoincrement Int primary key', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    protected $table = 'User';

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];
}`)
  })

  it('generates timestamp constants for createdAt/updatedAt column names', () => {
    const agent = makeModel({
      name: 'Agent',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(eloquentModels([agent], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Agent extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $table = 'Agent';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'name',
    ];
}`)
  })

  it('emits no timestamp configuration for default created_at/updated_at column names', () => {
    const agent = makeModel({
      name: 'Agent',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'created_at',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updated_at', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(eloquentModels([agent], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Agent extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    protected $table = 'Agent';

    protected $keyType = 'string';

    public $incrementing = false;
}`)
  })

  it('sets UPDATED_AT to null when only a created timestamp exists', () => {
    const log = makeModel({
      name: 'Log',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
      ],
    })

    expect(eloquentModels([log], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Log extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;

    protected $table = 'Log';

    protected $keyType = 'string';

    public $incrementing = false;
}`)
  })

  it('generates casts for boolean, integer, float, datetime, json, and list fields', () => {
    const mission = makeModel({
      name: 'Mission',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
        makeField({ name: 'priority', type: 'Int' }),
        makeField({ name: 'score', type: 'Float' }),
        makeField({ name: 'completed', type: 'Boolean' }),
        makeField({ name: 'startedAt', type: 'DateTime' }),
        makeField({ name: 'metadata', type: 'Json' }),
        makeField({ name: 'tags', type: 'String', isList: true }),
      ],
    })

    expect(eloquentModels([mission], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Mission extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    protected $table = 'Mission';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
        'priority',
        'score',
        'completed',
        'startedAt',
        'metadata',
        'tags',
    ];

    protected $casts = [
        'priority' => 'integer',
        'score' => 'float',
        'completed' => 'boolean',
        'startedAt' => 'datetime',
        'metadata' => 'array',
    ];
}`)
  })

  it('casts enum fields to the generated enum class', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: null },
          { name: 'USER', dbName: null },
        ],
        dbName: null,
      },
    ]
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models', [user], enums)).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'User';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'role',
    ];

    protected $casts = [
        'role' => Role::class,
    ];
}`)
  })

  it('keeps a composite key out of $primaryKey, and takes it as an array of its columns to find, destroy, save, select or delete', () => {
    const like = makeModel({
      name: 'Like',
      primaryKey: { name: null, fields: ['userId', 'postId'] },
      fields: [
        makeField({ name: 'userId', type: 'String', isReadOnly: true }),
        makeField({ name: 'postId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'LikeToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'likes',
          type: 'Like',
          kind: 'object',
          isList: true,
          relationName: 'LikeToUser',
        }),
      ],
    })

    expect(eloquentModels([like], 'App\\Models', [like, user])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Like extends Model
{
    const KEY_COLUMNS = ['userId', 'postId'];

    protected $table = 'Like';

    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'userId',
        'postId',
    ];

    public function getKey()
    {
        $key = [];
        foreach (static::KEY_COLUMNS as $column) {
            $key[$column] = $this->getAttribute($column);
        }

        return $key;
    }

    public function newEloquentBuilder($query)
    {
        return new CompositeKeyBuilder($query);
    }

    public function newCollection(array $models = [])
    {
        return new CompositeKeyCollection($models);
    }

    public static function destroy($ids)
    {
        $count = 0;
        foreach ((new static())->newQuery()->whereKey(func_num_args() > 1 ? func_get_args() : $ids)->get() as $model) {
            if ($model->delete()) {
                $count++;
            }
        }

        return $count;
    }

    protected function setKeysForSaveQuery($query)
    {
        foreach (static::KEY_COLUMNS as $column) {
            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));
        }

        return $query;
    }

    protected function setKeysForSelectQuery($query)
    {
        foreach (static::KEY_COLUMNS as $column) {
            $query->where($column, '=', $this->original[$column] ?? $this->getAttribute($column));
        }

        return $query;
    }

    public function delete()
    {
        $this->mergeAttributesFromCachedCasts();

        if (! $this->exists) {
            return null;
        }

        if ($this->fireModelEvent('deleting') === false) {
            return false;
        }

        $this->touchOwners();
        $this->performDeleteOnModel();
        $this->fireModelEvent('deleted', false);

        return true;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }
}`)
  })

  it('generates belongsToMany for an implicit many-to-many relation', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ],
    })

    expect(eloquentModels([post], 'App\\Models', [post, tag])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Post extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Post';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(Tag::class, '_PostToTag', 'A', 'B');
    }
}`)

    expect(eloquentModels([tag], 'App\\Models', [post, tag])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Tag extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Tag';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, '_PostToTag', 'B', 'A');
    }
}`)
  })

  it('uses the relation name for the join table of a named implicit many-to-many relation', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })

    expect(eloquentModels([tag], 'App\\Models', [post, tag])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Tag extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Tag';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function posts(): BelongsToMany
    {
        return $this->belongsToMany(Post::class, '_PostTags', 'B', 'A');
    }
}`)
  })

  it('uses @map and @@map database names for table, primary key, and foreign key', () => {
    const user = makeModel({
      name: 'User',
      dbName: 'users',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          dbName: 'user_id',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'displayName', type: 'String', dbName: 'display_name' }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      dbName: 'posts',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userId', type: 'String', dbName: 'author_id', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models', [user, post])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'users';

    protected $primaryKey = 'user_id';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'display_name',
    ];

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class, 'author_id');
    }
}`)

    expect(eloquentModels([post], 'App\\Models', [user, post])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Post extends Model
{
    use HasVersion4Uuids;

    protected $table = 'posts';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'author_id',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }
}`)
  })

  it('renders model documentation as a PHPDoc block', () => {
    const user = makeModel({
      name: 'User',
      documentation: 'Application user account.',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

/**
 * Application user account.
 */
class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'User';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;
}`)
  })

  it('generates two belongsTo for a self-referencing relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'followers',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'Follower',
        }),
        makeField({
          name: 'following',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'Following',
        }),
      ],
    })
    const follow = makeModel({
      name: 'Follow',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'followerId', type: 'String', isReadOnly: true }),
        makeField({ name: 'followingId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'follower',
          type: 'User',
          kind: 'object',
          relationName: 'Following',
          relationFromFields: ['followerId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'following',
          type: 'User',
          kind: 'object',
          relationName: 'Follower',
          relationFromFields: ['followingId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(eloquentModels([follow], 'App\\Models', [user, follow])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Follow extends Model
{
    use HasVersion4Uuids;

    protected $table = 'Follow';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'followerId',
        'followingId',
    ];

    public function follower(): BelongsTo
    {
        return $this->belongsTo(User::class, 'followerId');
    }

    public function following(): BelongsTo
    {
        return $this->belongsTo(User::class, 'followingId');
    }
}`)

    expect(eloquentModels([user], 'App\\Models', [user, follow])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'User';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function followers(): HasMany
    {
        return $this->hasMany(Follow::class, 'followingId');
    }

    public function following(): HasMany
    {
        return $this->hasMany(Follow::class, 'followerId');
    }
}`)
  })

  it('sets CREATED_AT to null when only an updated timestamp exists', () => {
    const revision = makeModel({
      name: 'Revision',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(eloquentModels([revision], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Revision extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    const CREATED_AT = null;
    const UPDATED_AT = 'updatedAt';

    protected $table = 'Revision';

    protected $keyType = 'string';

    public $incrementing = false;
}`)
  })

  it('detects updatedAt via isUpdatedAt on a non-conventional column name', () => {
    const document = makeModel({
      name: 'Document',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'revisedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(eloquentModels([document], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;

class Document extends Model
{
    use HasVersion4Uuids;
    use PrismaDates;

    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'revisedAt';

    protected $table = 'Document';

    protected $keyType = 'string';

    public $incrementing = false;
}`)
  })

  it('keeps incrementing false for a non-autoincrement Int primary key', () => {
    const counter = makeModel({
      name: 'Counter',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'value', type: 'Int' }),
      ],
    })

    expect(eloquentModels([counter], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class Counter extends Model
{
    protected $table = 'Counter';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
        'value',
    ];

    protected $casts = [
        'value' => 'integer',
    ];
}`)
  })

  it('generates hasOne for a one-to-one relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
          isRequired: false,
          relationName: 'ProfileToUser',
        }),
      ],
    })
    const profile = makeModel({
      name: 'Profile',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userId', type: 'String', isUnique: true, isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'ProfileToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(eloquentModels([user], 'App\\Models', [user, profile])).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasVersion4Uuids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasOne;

class User extends Model
{
    use HasVersion4Uuids;

    protected $table = 'User';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class, 'userId');
    }
}`)
  })
})

describe('uuid v7 primary key', () => {
  it('uses the HasUuids trait for uuid(7) primary keys', () => {
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [7] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(eloquentModels([event], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasUuids;
use Illuminate\\Database\\Eloquent\\Model;

class Event extends Model
{
    use HasUuids;

    protected $table = 'Event';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];
}`)
  })
})

describe('ulid primary key', () => {
  it('uses the HasUlids trait for ulid() primary keys, making them upper case as Prisma Client does', () => {
    const ticket = makeModel({
      name: 'Ticket',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({ name: 'label', type: 'String' }),
      ],
    })

    expect(eloquentModels([ticket], 'App\\Models')).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasUlids;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Support\\Str;

class Ticket extends Model
{
    use HasUlids;

    protected $table = 'Ticket';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'label',
    ];

    public function newUniqueId()
    {
        return (string) Str::ulid();
    }
}`)
  })
})

describe('what examples/eloquent found', () => {
  const autoincrementId = makeField({
    name: 'id',
    type: 'Int',
    isId: true,
    hasDefaultValue: true,
    default: { name: 'autoincrement', args: [] },
  })

  it('quotes an enum value PHP would read as the end of the string', () => {
    const mood: DMMF.DatamodelEnum = {
      name: 'Mood',
      dbName: null,
      values: [
        { name: 'FINE', dbName: "it's fine" },
        { name: 'ESCAPED', dbName: 'back\\slash\\' },
      ],
    }

    expect(eloquentEnum(mood, 'App\\Models')).toBe(`<?php

namespace App\\Models;

enum Mood: string
{
    case FINE = 'it\\'s fine';
    case ESCAPED = 'back\\\\slash\\\\';
}`)
  })

  it('writes a */ in a doc comment so the docblock goes on', () => {
    const model = makeModel({
      name: 'Note',
      documentation: 'Ends early: */ and goes on.',
      fields: [autoincrementId],
    })

    expect(eloquentModels([model], 'App\\Models')).toContain(`/**
 * Ends early: *\\/ and goes on.
 */
class Note extends Model`)
  })

  it('reads a self relation whose list side comes first as a hasMany, and a self many-to-many by field name', () => {
    const category = makeModel({
      name: 'Category',
      fields: [
        autoincrementId,
        makeField({
          name: 'children',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'Tree',
        }),
        makeField({ name: 'parentId', type: 'Int', isRequired: false }),
        makeField({
          name: 'parent',
          type: 'Category',
          kind: 'object',
          isRequired: false,
          relationName: 'Tree',
          relationFromFields: ['parentId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'following',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
        makeField({
          name: 'followers',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
      ],
    })

    const result = eloquentModels([category], 'App\\Models')
    expect(result).toContain(`        return $this->hasMany(Category::class, 'parentId');`)
    // Of the two fields, `followers` sorts first: its own key is in A.
    expect(result).toContain(`    public function following(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, '_Follows', 'B', 'A');
    }`)
    expect(result).toContain(`    public function followers(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, '_Follows', 'A', 'B');
    }`)
  })

  it('puts the literal defaults on a new model, as the database holds them', () => {
    const role: DMMF.DatamodelEnum = {
      name: 'Role',
      dbName: null,
      values: [{ name: 'CUSTOMER', dbName: 'customer' }],
    }
    const model = makeModel({
      name: 'Product',
      fields: [
        autoincrementId,
        makeField({ name: 'weight', type: 'Float', hasDefaultValue: true, default: 0 }),
        makeField({ name: 'stock', type: 'Int', hasDefaultValue: true, default: -1 }),
        makeField({ name: 'price', type: 'Decimal', hasDefaultValue: true, default: 1.5 }),
        makeField({
          name: 'big',
          type: 'BigInt',
          hasDefaultValue: true,
          default: '9007199254740993',
        }),
        makeField({ name: 'active', type: 'Boolean', hasDefaultValue: true, default: true }),
        makeField({
          name: 'label',
          type: 'String',
          hasDefaultValue: true,
          default: 'it\'s "quoted" \\ back',
        }),
        makeField({
          name: 'releasedAt',
          type: 'DateTime',
          dbName: 'released_at',
          hasDefaultValue: true,
          default: '2020-01-01T00:00:00.000Z',
        }),
        makeField({
          name: 'role',
          type: 'Role',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'CUSTOMER',
        }),
        makeField({
          name: 'seenAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
      ],
    })

    expect(eloquentModels([model], 'App\\Models', undefined, [role]))
      .toContain(`    protected $attributes = [
        'weight' => 0.0,
        'stock' => -1,
        'price' => '1.5',
        'big' => 9007199254740993,
        'active' => true,
        'label' => 'it\\'s "quoted" \\\\ back',
        'released_at' => '2020-01-01 00:00:00.000',
        'role' => 'customer',
    ];`)
  })

  it('lets a key nothing generates be given through create()', () => {
    const model = makeModel({
      name: 'Coupon',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'cuid', args: [1] },
        }),
        makeField({ name: 'code', type: 'String' }),
      ],
    })

    expect(eloquentModels([model], 'App\\Models')).toContain(`    protected $fillable = [
        'id',
        'code',
    ];`)
  })

  it('renames the one case name PHP keeps for itself, and keeps its value', () => {
    const kind: DMMF.DatamodelEnum = {
      name: 'Kind',
      dbName: null,
      values: [
        { name: 'CLASS', dbName: null },
        { name: 'STATIC', dbName: null },
      ],
    }

    expect(eloquentEnum(kind, 'App\\Models')).toContain(`    case CLASS_ = 'CLASS';
    case STATIC = 'STATIC';`)
  })

  it('casts Bytes through AsBytes, which binds a stream so the column holds a BLOB', () => {
    const model = makeModel({
      name: 'Profile',
      fields: [autoincrementId, makeField({ name: 'avatar', type: 'Bytes', isRequired: false })],
    })

    expect(eloquentModels([model], 'App\\Models')).toContain(`    protected $casts = [
        'avatar' => AsBytes::class,
    ];`)
    expect(eloquentBytesCast('App\\Models')).toContain(`class AsBytes implements CastsAttributes`)
  })

  it('writes a DateTime as Prisma Client does, in UTC with milliseconds, a default included', () => {
    const model = makeModel({
      name: 'Event',
      fields: [
        autoincrementId,
        makeField({
          name: 'at',
          type: 'DateTime',
          hasDefaultValue: true,
          default: '2020-01-01T00:00:00Z',
        }),
      ],
    })

    const sqlite = eloquentModels([model], 'App\\Models', undefined, undefined, {
      provider: 'sqlite',
    })
    expect(sqlite).toContain(`class Event extends Model
{
    use PrismaDates;
`)
    expect(sqlite).toContain(`        'at' => '2020-01-01T00:00:00.000+00:00',`)
    const postgres = eloquentModels([model], 'App\\Models', undefined, undefined, {
      provider: 'postgresql',
    })
    expect(postgres).toContain(`        'at' => '2020-01-01 00:00:00.000',`)

    const [trait] = eloquentSupportFiles([model], 'App\\Models', 'sqlite')
    expect(trait?.fileName).toBe('PrismaDates.php')
    expect(trait?.code).toContain(`trait PrismaDates
{
    public function fromDateTime($value)
    {
        return empty($value) ? $value : parent::asDateTime($value)->setTimezone('UTC')->format('Y-m-d\\TH:i:s.vP');
    }

    protected function asDateTime($value)
    {
        return is_string($value) ? Date::parse($value, 'UTC') : parent::asDateTime($value);
    }
}`)
    expect(eloquentSupportFiles([model], 'App\\Models', 'postgresql')[0]?.code).toContain(
      `->setTimezone('UTC')->format('Y-m-d H:i:s.v');`,
    )
  })

  it('names a relation Eloquent would read as something else', () => {
    const model = makeModel({
      name: 'Post',
      fields: [
        autoincrementId,
        makeField({ name: 'authorId', type: 'Int', dbName: 'author' }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'Push',
          type: 'User',
          kind: 'object',
          isList: true,
          relationName: 'Pushes',
        }),
      ],
    })

    expect(eloquentProblems([model])).toStrictEqual([
      "field Post.Push: Push() is a method of Eloquent's Model; rename the relation field",
      'field Post.author: a column of Post has the name too, and $model->author would read the column; rename the relation field or @map the column',
    ])
  })
})

describe('corners of a schema, each run in examples/eloquent', () => {
  const autoincrementId = makeField({
    name: 'id',
    type: 'Int',
    isId: true,
    hasDefaultValue: true,
    default: { name: 'autoincrement', args: [] },
  })

  it('keys a model with no @id by its @unique, or by its @@unique column by column', () => {
    const setting = makeModel({
      name: 'Setting',
      fields: [
        makeField({ name: 'key', type: 'String', isUnique: true }),
        makeField({ name: 'value', type: 'String' }),
      ],
    })
    const rate = makeModel({
      name: 'Rate',
      fields: [
        makeField({ name: 'base', type: 'String' }),
        makeField({ name: 'quote', type: 'String' }),
        makeField({ name: 'note', type: 'String', isRequired: false, isUnique: true }),
      ],
      uniqueFields: [['base', 'quote']],
    })

    const single = eloquentModels([setting], 'App\\Models')
    expect(single).toContain(`    protected $primaryKey = 'key';

    protected $keyType = 'string';

    public $incrementing = false;`)
    expect(single).toContain(`    protected $fillable = [
        'key',
        'value',
    ];`)
    // An optional @unique cannot name a row: the required pair does.
    const pair = eloquentModels([rate], 'App\\Models')
    expect(pair).toContain('    protected $primaryKey = null;')
    expect(pair).toContain(`    const KEY_COLUMNS = ['base', 'quote'];`)
  })

  it('fills a uuid() or ulid() that is not the key, and a now(), as the model saves', () => {
    const order = makeModel({
      name: 'Order',
      fields: [
        autoincrementId,
        makeField({
          name: 'publicId',
          type: 'String',
          dbName: 'public_id',
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({
          name: 'token',
          type: 'String',
          hasDefaultValue: true,
          default: { name: 'uuid', args: [7] },
        }),
        makeField({
          name: 'placedAt',
          type: 'DateTime',
          dbName: 'placed_at',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
      ],
    })

    const sqlite = eloquentModels([order], 'App\\Models', undefined, undefined, {
      provider: 'sqlite',
    })
    expect(sqlite).toContain('use Illuminate\\Support\\Str;')
    expect(sqlite).toContain(`    public function save(array $options = [])
    {
        if (! $this->exists) {
            if (! array_key_exists('public_id', $this->attributes)) {
                $this->setAttribute('public_id', (string) Str::ulid());
            }
            if (! array_key_exists('token', $this->attributes)) {
                $this->setAttribute('token', (string) Str::uuid7());
            }
            if (! array_key_exists('placed_at', $this->attributes)) {
                $this->setAttribute('placed_at', $this->freshTimestamp());
            }
        }

        return parent::save($options);
    }`)
    // Prisma Client fills now() itself on every database, from its own clock in UTC.
    const postgres = eloquentModels([order], 'App\\Models', undefined, undefined, {
      provider: 'postgresql',
    })
    expect(postgres).toContain(
      `                $this->setAttribute('placed_at', $this->freshTimestamp());`,
    )
  })

  it('stamps a second @updatedAt with the time Eloquent gives UPDATED_AT', () => {
    const model = makeModel({
      name: 'Setting',
      fields: [
        autoincrementId,
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
        makeField({
          name: 'syncedAt',
          type: 'DateTime',
          dbName: 'synced_at',
          isUpdatedAt: true,
        }),
      ],
    })

    expect(eloquentModels([model], 'App\\Models')).toContain(`    public function updateTimestamps()
    {
        $givenSyncedAt = $this->isDirty('synced_at');
        parent::updateTimestamps();
        if (! $givenSyncedAt) {
            $this->setAttribute('synced_at', $this->getAttribute($this->getUpdatedAtColumn()));
        }

        return $this;
    }`)
  })

  it('casts a Decimal through AsDecimal, and a date without a time to a date', () => {
    const model = makeModel({
      name: 'Price',
      fields: [
        autoincrementId,
        makeField({ name: 'amount', type: 'Decimal' }),
        makeField({ name: 'exact', type: 'Decimal', nativeType: ['Decimal', ['10', '2']] }),
        makeField({ name: 'day', type: 'DateTime', nativeType: ['Date', []] }),
      ],
    })

    expect(eloquentModels([model], 'App\\Models')).toContain(`    protected $casts = [
        'amount' => AsDecimal::class,
        'exact' => AsDecimal::class,
        'day' => 'date',
    ];`)
  })

  it('names the key of a relation wherever it is not the key Eloquent takes', () => {
    const legacy = makeModel({
      name: 'Legacy',
      fields: [
        makeField({ name: 'code', type: 'String', isId: true }),
        makeField({ name: 'id', type: 'Int', isUnique: true }),
        makeField({
          name: 'notes',
          type: 'Note',
          kind: 'object',
          isList: true,
          relationName: 'LegacyToNote',
        }),
      ],
    })
    const note = makeModel({
      name: 'Note',
      fields: [
        autoincrementId,
        makeField({ name: 'legacyId', type: 'Int' }),
        makeField({
          name: 'legacy',
          type: 'Legacy',
          kind: 'object',
          relationName: 'LegacyToNote',
          relationFromFields: ['legacyId'],
          relationToFields: ['id'],
        }),
      ],
    })

    const models = [legacy, note]
    // `id` is a column of Legacy, but its key is `code`: Eloquent would take that.
    expect(eloquentModels([note], 'App\\Models', models)).toContain(
      `        return $this->belongsTo(Legacy::class, 'legacyId', 'id');`,
    )
    expect(eloquentModels([legacy], 'App\\Models', models)).toContain(
      `        return $this->hasMany(Note::class, 'legacyId', 'id');`,
    )
  })

  it("writes Laravel's classes in full where a model or enum of the namespace has the name", () => {
    const model = makeModel({
      name: 'Model',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({ name: 'kind', type: 'Str', kind: 'enum' }),
        makeField({
          name: 'items',
          type: 'HasMany',
          kind: 'object',
          isList: true,
          relationName: 'Items',
        }),
      ],
    })
    const hasMany = makeModel({
      name: 'HasMany',
      fields: [
        autoincrementId,
        makeField({ name: 'modelId', type: 'String' }),
        makeField({
          name: 'model',
          type: 'Model',
          kind: 'object',
          relationName: 'Items',
          relationFromFields: ['modelId'],
          relationToFields: ['id'],
        }),
      ],
    })
    const str: DMMF.DatamodelEnum = {
      name: 'Str',
      dbName: null,
      values: [{ name: 'A', dbName: null }],
    }

    const result = eloquentModels([model], 'App\\Models', [model, hasMany], [str])
    expect(result).toContain(`namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Concerns\\HasUlids;

class Model extends \\Illuminate\\Database\\Eloquent\\Model`)
    expect(result).toContain(`        'kind' => Str::class,`)
    expect(result).toContain(`        return (string) \\Illuminate\\Support\\Str::ulid();`)
    expect(result)
      .toContain(`    public function items(): \\Illuminate\\Database\\Eloquent\\Relations\\HasMany
    {
        return $this->hasMany(HasMany::class, 'modelId');
    }`)
  })

  it('writes the doc comment of an enum as its docblock', () => {
    const mood: DMMF.DatamodelEnum = {
      name: 'Mood',
      dbName: null,
      documentation: 'Values PHP has to quote: */ ends nothing.',
      values: [{ name: 'FINE', dbName: null }],
    }

    expect(eloquentEnum(mood, 'App\\Models')).toContain(`/**
 * Values PHP has to quote: *\\/ ends nothing.
 */
enum Mood: string`)
  })

  it('serializes Bytes as base64, which json_encode takes', () => {
    expect(eloquentBytesCast('App\\Models')).toContain(
      `class AsBytes implements CastsAttributes, SerializesCastableAttributes`,
    )
    expect(eloquentBytesCast('App\\Models')).toContain(
      `        return $value === null ? null : base64_encode($value);`,
    )
  })

  it('writes beside the models only the casts and the query builder they name', () => {
    const plain = makeModel({ name: 'Plain', fields: [autoincrementId] })
    const priced = makeModel({
      name: 'Priced',
      fields: [autoincrementId, makeField({ name: 'price', type: 'Decimal' })],
    })
    const pair = makeModel({
      name: 'Pair',
      fields: [makeField({ name: 'a', type: 'Int' }), makeField({ name: 'b', type: 'Int' })],
      primaryKey: { name: null, fields: ['a', 'b'] },
    })

    expect(eloquentSupportFiles([plain], 'App')).toStrictEqual([])
    expect(
      eloquentSupportFiles([plain, priced, pair], 'App').map((file) => file.fileName),
    ).toStrictEqual(['AsDecimal.php', 'CompositeKeyBuilder.php', 'CompositeKeyCollection.php'])
  })

  it('reads a Decimal as the string Prisma prints, without the zeros of a scale', () => {
    const [cast] = eloquentSupportFiles(
      [makeModel({ name: 'P', fields: [makeField({ name: 'price', type: 'Decimal' })] })],
      'App\\Models',
    )
    expect(cast?.code).toContain(`class AsDecimal implements CastsAttributes`)
    expect(cast?.code).toContain(`        if (str_contains($number, '.')) {
            $number = rtrim(rtrim($number, '0'), '.');
        }`)
  })

  it('takes a composite key as an array of every column of it, and refuses a part of one', () => {
    const [builder] = eloquentSupportFiles(
      [
        makeModel({
          name: 'Pair',
          fields: [makeField({ name: 'a', type: 'Int' }), makeField({ name: 'b', type: 'Int' })],
          primaryKey: { name: null, fields: ['a', 'b'] },
        }),
      ],
      'App\\Models',
    )
    expect(builder?.code).toContain('class CompositeKeyBuilder extends Builder')
    for (const method of ['find', 'findMany', 'findOrFail', 'whereKey', 'whereKeyNot']) {
      expect(builder?.code).toContain(`    public function ${method}(`)
    }
    expect(builder?.code).toContain(
      `        if (! is_array($key) || count($key) !== count($columns) || array_diff($columns, array_keys($key)) !== []) {
            throw new InvalidArgumentException($this->refusal($key));
        }`,
    )
  })

  it('keys a collection of models with a composite key by the JSON of the key', () => {
    const [, collection] = eloquentSupportFiles(
      [
        makeModel({
          name: 'Pair',
          fields: [makeField({ name: 'a', type: 'Int' }), makeField({ name: 'b', type: 'Int' })],
          primaryKey: { name: null, fields: ['a', 'b'] },
        }),
      ],
      'App\\Models',
    )
    expect(collection?.code).toContain('class CompositeKeyCollection extends Collection')
    expect(collection?.code).toContain(`        ksort($attribute);

        return json_encode(array_map(fn ($value) => is_scalar($value) ? (string) $value : $value, $attribute));`)
  })

  it('names a model or enum that has the name of a class written beside the models', () => {
    const pair = makeModel({
      name: 'CompositeKeyBuilder',
      fields: [makeField({ name: 'a', type: 'Int' }), makeField({ name: 'b', type: 'Int' })],
      primaryKey: { name: null, fields: ['a', 'b'] },
    })
    const asDecimal: DMMF.DatamodelEnum = { name: 'AsDecimal', dbName: null, values: [] }

    // No Decimal: AsDecimal is not written, and the enum may have the name.
    expect(eloquentProblems([pair], [asDecimal])).toStrictEqual([
      'model CompositeKeyBuilder: CompositeKeyBuilder is the query of a model keyed by several columns, written beside the models; rename the model',
    ])
  })

  it('names the class, column and relation names Eloquent or PHP would take for something else', () => {
    const list = makeModel({
      name: 'list',
      fields: [
        autoincrementId,
        makeField({ name: 'exists', type: 'Boolean' }),
        makeField({ name: 'avatar', type: 'Bytes' }),
        makeField({ name: 'hidden', type: 'Boolean', dbName: 'timestamps' }),
        makeField({ name: 'posts', type: 'Post', kind: 'object', isList: true, relationName: 'A' }),
        makeField({ name: 'Posts', type: 'Post', kind: 'object', isList: true, relationName: 'B' }),
      ],
    })
    const snake = makeModel({ name: 'user_role', fields: [autoincrementId] })
    const pascal = makeModel({ name: 'UserRole', fields: [autoincrementId] })
    const asBytes: DMMF.DatamodelEnum = { name: 'AsBytes', dbName: null, values: [] }

    expect(eloquentProblems([list, snake, pascal], [asBytes])).toStrictEqual([
      'model list: PHP keeps List for itself and cannot name a class after it; rename the model and @@map the table',
      'enum AsBytes: AsBytes is the cast of Bytes columns, written beside the models; rename the enum',
      'model UserRole: its class UserRole is the class of model user_role too, as PHP compares class names without regard to case; rename one of them',
      "field list.exists: $model->exists is a property of Eloquent's Model, not the column; @map the column to another name",
      "field list.hidden: $model->timestamps is a property of Eloquent's Model, not the column; @map the column to another name",
      'field list.Posts: another relation of list has the name but for case, and PHP would take the two methods for one; rename one of them',
    ])
  })
})
