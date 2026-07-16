import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { eloquentEnum, eloquentModels, prismaTypeToEloquentCast } from './eloquent.js'

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
    protected $table = 'user';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Post extends Model
{
    protected $table = 'post';

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
    protected $table = 'user';

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

use Illuminate\\Database\\Eloquent\\Model;

class Agent extends Model
{
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $table = 'agent';

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

use Illuminate\\Database\\Eloquent\\Model;

class Agent extends Model
{
    protected $table = 'agent';

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

use Illuminate\\Database\\Eloquent\\Model;

class Log extends Model
{
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;

    protected $table = 'log';

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

use Illuminate\\Database\\Eloquent\\Model;

class Mission extends Model
{
    protected $table = 'mission';

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
        'tags' => 'array',
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

use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    protected $table = 'user';

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

  it('disables the primary key for composite primary key models', () => {
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
    protected $table = 'like';

    protected $primaryKey = null;

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'userId',
        'postId',
    ];

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Post extends Model
{
    protected $table = 'post';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Tag extends Model
{
    protected $table = 'tag';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Tag extends Model
{
    protected $table = 'tag';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Post extends Model
{
    protected $table = 'posts';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'author_id',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id', 'user_id');
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

use Illuminate\\Database\\Eloquent\\Model;

/**
 * Application user account.
 */
class User extends Model
{
    protected $table = 'user';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Follow extends Model
{
    protected $table = 'follow';

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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

class User extends Model
{
    protected $table = 'user';

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

use Illuminate\\Database\\Eloquent\\Model;

class Revision extends Model
{
    const CREATED_AT = null;
    const UPDATED_AT = 'updatedAt';

    protected $table = 'revision';

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

use Illuminate\\Database\\Eloquent\\Model;

class Document extends Model
{
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'revisedAt';

    protected $table = 'document';

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
    protected $table = 'counter';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
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

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasOne;

class User extends Model
{
    protected $table = 'user';

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
