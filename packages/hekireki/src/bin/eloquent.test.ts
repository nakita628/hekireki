import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/bin/eloquent.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-eloquent/schema.prisma', { force: true })
    fs.rmSync('./prisma-eloquent/eloquent', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-eloquent', { recursive: true, force: true })
  })
  it('hekireki-eloquent', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-Eloquent {
    provider = "hekireki-eloquent"
    output   = "eloquent"
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id      String @id @default(uuid())
    title   String
    content String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-eloquent', { recursive: true })
    fs.writeFileSync('./prisma-eloquent/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-eloquent/schema.prisma')

    const userResult = fs.readFileSync('./prisma-eloquent/eloquent/User.php', {
      encoding: 'utf-8',
    })
    const userExpected = `<?php

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
}`

    expect(userResult).toBe(userExpected)

    const postResult = fs.readFileSync('./prisma-eloquent/eloquent/Post.php', {
      encoding: 'utf-8',
    })
    const postExpected = `<?php

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
        'content',
        'userId',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'userId');
    }
}`

    expect(postResult).toBe(postExpected)
  }, 30000)

  it('hekireki-eloquent with implicit many-to-many and self-referencing relations', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-Eloquent {
    provider = "hekireki-eloquent"
    output   = "eloquent"
}

model User {
    id        String   @id @default(uuid())
    name      String
    followers Follow[] @relation("Follower")
    following Follow[] @relation("Following")
    groups    Group[]
}

model Group {
    id      String @id @default(uuid())
    name    String
    members User[]
}

model Follow {
    followerId  String
    followingId String
    follower    User   @relation("Following", fields: [followerId], references: [id])
    following   User   @relation("Follower", fields: [followingId], references: [id])

    @@id([followerId, followingId])
}
`

    fs.mkdirSync('./prisma-eloquent', { recursive: true })
    fs.writeFileSync('./prisma-eloquent/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-eloquent/schema.prisma')

    const userResult = fs.readFileSync('./prisma-eloquent/eloquent/User.php', {
      encoding: 'utf-8',
    })
    const userExpected = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;
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

    public function followers(): HasMany
    {
        return $this->hasMany(Follow::class, 'followingId');
    }

    public function following(): HasMany
    {
        return $this->hasMany(Follow::class, 'followerId');
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(Group::class, '_GroupToUser', 'B', 'A');
    }
}`

    expect(userResult).toBe(userExpected)

    const groupResult = fs.readFileSync('./prisma-eloquent/eloquent/Group.php', {
      encoding: 'utf-8',
    })
    const groupExpected = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsToMany;

class Group extends Model
{
    protected $table = 'group';

    protected $keyType = 'string';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        'name',
    ];

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(User::class, '_GroupToUser', 'A', 'B');
    }
}`

    expect(groupResult).toBe(groupExpected)

    const followResult = fs.readFileSync('./prisma-eloquent/eloquent/Follow.php', {
      encoding: 'utf-8',
    })
    const followExpected = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class Follow extends Model
{
    protected $table = 'follow';

    protected $primaryKey = null;

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
}`

    expect(followResult).toBe(followExpected)
  }, 30000)

  it('hekireki-eloquent with namespace, enum, and timestamps', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-Eloquent {
    provider  = "hekireki-eloquent"
    output    = "eloquent"
    namespace = "Domain.Models"
}

enum Role {
    ADMIN
    USER
}

model User {
    id        Int      @id @default(autoincrement())
    name      String
    active    Boolean  @default(true)
    role      Role     @default(USER)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`

    fs.mkdirSync('./prisma-eloquent', { recursive: true })
    fs.writeFileSync('./prisma-eloquent/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-eloquent/schema.prisma')

    const userResult = fs.readFileSync('./prisma-eloquent/eloquent/User.php', {
      encoding: 'utf-8',
    })
    const userExpected = `<?php

namespace Domain\\Models;

use Illuminate\\Database\\Eloquent\\Model;

class User extends Model
{
    const CREATED_AT = 'createdAt';
    const UPDATED_AT = 'updatedAt';

    protected $table = 'user';

    protected $fillable = [
        'name',
        'active',
        'role',
    ];

    protected $casts = [
        'active' => 'boolean',
        'role' => Role::class,
    ];
}`

    expect(userResult).toBe(userExpected)

    const roleResult = fs.readFileSync('./prisma-eloquent/eloquent/Role.php', {
      encoding: 'utf-8',
    })
    const roleExpected = `<?php

namespace Domain\\Models;

enum Role: string
{
    case ADMIN = 'ADMIN';
    case USER = 'USER';
}`

    expect(roleResult).toBe(roleExpected)
  }, 30000)
})
