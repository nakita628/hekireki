import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { efcoreFiles } from './efcore.js'

const SCHEMA = `datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  MEMBER
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  role  Role   @default(MEMBER)
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`

describe('efcoreFiles', () => {
  it('writes an entity class per model, an enum per enum, and the DbContext last', () => {
    const result = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
    if ('type' in result) throw new Error(result.error.message)
    expect(
      efcoreFiles(result.datamodel, {
        namespace: 'Models',
        context: 'AppDbContext',
      }),
    ).toStrictEqual([
      {
        fileName: 'User.cs',
        code: `#nullable enable

using System.Collections.Generic;

namespace Models;

public partial class User
{
    public int Id { get; set; }

    public string Email { get; set; } = null!;

    public Role Role { get; set; } = Role.Member;

    public virtual ICollection<Post> Posts { get; set; } = new List<Post>();
}
`,
      },
      {
        fileName: 'Post.cs',
        code: `#nullable enable

namespace Models;

public partial class Post
{
    public int Id { get; set; }

    public int AuthorId { get; set; }

    public virtual User Author { get; set; } = null!;
}
`,
      },
      {
        fileName: 'Role.cs',
        code: `#nullable enable

using NpgsqlTypes;

namespace Models;

public enum Role
{
    [PgName("ADMIN")]
    Admin,

    [PgName("MEMBER")]
    Member,
}
`,
      },
      {
        fileName: 'AppDbContext.cs',
        code: `#nullable enable

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

namespace Models;

public partial class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Post> Posts { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
        npgsql.MapEnum<Role>("Role");
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
        dataSource.MapEnum<Role>("Role");
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
        ConfigureConventionsPartial(configurationBuilder);
    }

    partial void ConfigureConventionsPartial(ModelConfigurationBuilder configurationBuilder);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresEnum<Role>(name: "Role");

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("User_pkey");

            entity.ToTable("User");

            entity.HasIndex(e => e.Email, "User_email_key").IsUnique();

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.Role)
                .ValueGeneratedNever()
                .HasDefaultValue(Role.Member)
                .HasColumnName("role");
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Post_pkey");

            entity.ToTable("Post");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.AuthorId).HasColumnName("authorId");

            entity.HasOne(d => d.Author).WithMany(p => p.Posts)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("Post_authorId_fkey");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
`,
      },
    ])
  })
})
