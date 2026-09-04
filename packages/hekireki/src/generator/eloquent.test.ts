import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { eloquentModelFiles } from './eloquent.js'

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

const enums: DMMF.DatamodelEnum[] = [
  {
    name: 'Role',
    values: [
      { name: 'USER', dbName: null },
      { name: 'ADMIN', dbName: null },
    ],
    dbName: null,
  },
]

const models = [
  makeModel({
    name: 'User',
    documentation: 'A person.',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true, documentation: 'Primary key.' }),
      makeField({ name: 'name', type: 'String' }),
      makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      makeField({
        name: 'posts',
        type: 'BlogPost',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'BlogPostToUser',
      }),
    ],
  }),
  makeModel({
    name: 'BlogPost',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'authorId', type: 'Int', isReadOnly: true }),
      makeField({
        name: 'author',
        type: 'User',
        kind: 'object',
        relationName: 'BlogPostToUser',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ],
  }),
]

const bare = [
  makeModel({ name: 'Bare', fields: [makeField({ name: 'id', type: 'Int', isId: true })] }),
]

describe('eloquentModelFiles', () => {
  it('writes one PascalCase .php file per model and per enum', () => {
    expect(eloquentModelFiles(models, 'App.Models', enums)).toStrictEqual([
      {
        fileName: 'User.php',
        code: `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

/**
 * A person.
 */
class User extends Model
{
    protected $table = 'user';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
        'role',
    ];

    protected $casts = [
        'role' => Role::class,
    ];

    public function posts(): HasMany
    {
        return $this->hasMany(BlogPost::class, 'authorId');
    }
}`,
      },
      {
        fileName: 'BlogPost.php',
        code: `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class BlogPost extends Model
{
    protected $table = 'blog_post';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'title',
        'authorId',
    ];

    protected $casts = [
        'authorId' => 'integer',
    ];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorId');
    }
}`,
      },
      {
        fileName: 'Role.php',
        code: `<?php

namespace App\\Models;

enum Role: string
{
    case USER = 'USER';
    case ADMIN = 'ADMIN';
}`,
      },
    ])
  })

  it('reads a dotted namespace and a namespace array the same way', () => {
    expect(eloquentModelFiles(models, ['App', 'Models'], enums)).toStrictEqual(
      eloquentModelFiles(models, 'App.Models', enums),
    )
  })

  it('keeps a model that has nothing but a primary key', () => {
    expect(eloquentModelFiles(bare, 'App')).toStrictEqual([
      {
        fileName: 'Bare.php',
        code: `<?php

namespace App;

use Illuminate\\Database\\Eloquent\\Model;

class Bare extends Model
{
    protected $table = 'bare';

    public $incrementing = false;

    public $timestamps = false;
}`,
      },
    ])
  })

  it('emits nothing for a schema without models or enums', () => {
    expect(eloquentModelFiles([], 'App')).toStrictEqual([])
  })
})
