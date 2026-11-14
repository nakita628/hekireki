import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
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
 *
 * @property int $id Primary key.
 */
class User extends Model
{
    protected $table = 'User';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
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
    protected $table = 'BlogPost';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
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
    protected $table = 'Bare';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
    ];
}`,
      },
    ])
  })

  it('names the file after the class, as PSR-4 autoloading looks for it', () => {
    const introspected = makeModel({
      name: 'store_setting',
      fields: [makeField({ name: 'key', type: 'String', isUnique: true })],
    })

    const [file] = eloquentModelFiles([introspected], 'App')
    expect(file?.fileName).toBe('StoreSetting.php')
    expect(file?.code).toContain('class StoreSetting extends Model')
  })

  it('emits nothing for a schema without models or enums', () => {
    expect(eloquentModelFiles([], 'App')).toStrictEqual([])
  })
})

describe('doc comments', () => {
  it('writes the prose of a model and its columns as PHPDoc, and of a relation and an enum above them', () => {
    const dmmf = getDMMF({
      datamodel: [
        [
          'schema.prisma',
          `datasource db {
  provider = "postgresql"
}
/// A person.
///
/// Second paragraph */ with \\\\ backslash.
model User {
  /// The key.
  id        Int      @id
  /// @z.string()
  name      String
  /// When they joined.
  /// Two lines.
  createdAt DateTime @default(now())
  /// Their posts.
  posts     Post[]
  tone      Tone
}
model Post {
  id       Int  @id
  /// Who wrote it.
  authorId Int
  /// The author.
  author   User @relation(fields: [authorId], references: [id])
}
/// How loud.
enum Tone {
  CALM
}
`,
        ],
      ],
    })
    if ('type' in dmmf) throw new Error(dmmf.error.message)
    const { models: documented, enums: documentedEnums } = dmmf.datamodel
    const files = eloquentModelFiles(documented, 'App\\Models', documentedEnums)
    expect(files.find((file) => file.fileName === 'User.php')?.code).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\HasMany;

/**
 * A person.
 *
 * Second paragraph *\\/ with \\\\ backslash.
 *
 * @property int $id The key.
 * @property \\Carbon\\CarbonInterface $createdAt When they joined.
 * Two lines.
 */
class User extends Model
{
    use PrismaDates;

    const CREATED_AT = 'createdAt';
    const UPDATED_AT = null;

    protected $table = 'User';

    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'tone',
    ];

    protected $casts = [
        'tone' => Tone::class,
    ];

    /** Their posts. */
    public function posts(): HasMany
    {
        return $this->hasMany(Post::class, 'authorId');
    }
}`)
    expect(files.find((file) => file.fileName === 'Post.php')?.code).toBe(`<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

/** @property int $authorId Who wrote it. */
class Post extends Model
{
    protected $table = 'Post';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'id',
        'authorId',
    ];

    protected $casts = [
        'authorId' => 'integer',
    ];

    /** The author. */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorId');
    }
}`)
    expect(files.find((file) => file.fileName === 'Tone.php')?.code).toBe(`<?php

namespace App\\Models;

/** How loud. */
enum Tone: string
{
    case CALM = 'CALM';
}`)
  })
})
