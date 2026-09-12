#nullable enable

using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Microsoft.EntityFrameworkCore.ValueGeneration;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;
using Visus.Cuid;

namespace Example.Models;

public partial class ExampleContext : DbContext
{
    public ExampleContext(DbContextOptions<ExampleContext> options)
        : base(options)
    {
    }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<Profile> Profiles { get; set; }

    public virtual DbSet<Post> Posts { get; set; }

    public virtual DbSet<Tag> Tags { get; set; }

    public virtual DbSet<Comment> Comments { get; set; }

    public virtual DbSet<Follow> Follows { get; set; }

    public virtual DbSet<Category> Categories { get; set; }

    public virtual DbSet<Order> Orders { get; set; }

    public virtual DbSet<OrderItem> OrderItems { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<Actor> Actors { get; set; }

    public virtual DbSet<Film> Films { get; set; }

    public static void MapEnums(NpgsqlDbContextOptionsBuilder npgsql)
    {
        npgsql.MapEnum<Role>("Role");
        npgsql.MapEnum<Visibility>("visibility_level");
    }

    public static void MapEnums(NpgsqlDataSourceBuilder dataSource)
    {
        dataSource.MapEnum<Role>("Role");
        dataSource.MapEnum<Visibility>("visibility_level");
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
        modelBuilder.HasPostgresEnum<Visibility>(name: "visibility_level");

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pkey");

            entity.ToTable("users");

            entity.HasIndex(e => e.Email, "users_email_key").IsUnique();

            entity.Property(e => e.Id)
                .HasValueGenerator<UuidV7StringGenerator>()
                .HasColumnName("id");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.Role)
                .ValueGeneratedNever()
                .HasDefaultValue(Role.Viewer)
                .HasColumnName("role");
            entity.Property(e => e.Interests)
                .ValueGeneratedNever()
                .HasDefaultValue(new List<string>())
                .HasColumnName("interests");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("created_at");
            entity.Property(e => e.UpdatedAt)
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("updated_at");
        });

        modelBuilder.Entity<Profile>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Profile_pkey");

            entity.ToTable("Profile");

            entity.HasIndex(e => e.UserId, "Profile_user_id_key").IsUnique();

            entity.Property(e => e.Id)
                .HasValueGenerator<Cuid2Generator>()
                .HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Bio).HasColumnName("bio");
            entity.Property(e => e.Nickname)
                .ValueGeneratedNever()
                .HasMaxLength(64)
                .HasDefaultValue("anonymous")
                .HasColumnName("nickname");
            entity.Property(e => e.Age).HasColumnName("age");
            entity.Property(e => e.Balance)
                .ValueGeneratedNever()
                .HasPrecision(10, 2)
                .HasDefaultValue(0m)
                .HasColumnName("balance");
            entity.Property(e => e.Verified)
                .ValueGeneratedNever()
                .HasDefaultValue(false)
                .HasColumnName("verified");
            entity.Property(e => e.Meta)
                .HasColumnType("jsonb")
                .HasColumnName("meta");
            entity.Property(e => e.Avatar).HasColumnName("avatar");
            entity.Property(e => e.LastSeen)
                .HasPrecision(6)
                .HasColumnName("last_seen");

            entity.HasOne(d => d.User).WithOne(p => p.Profile)
                .HasForeignKey<Profile>(d => d.UserId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("Profile_user_id_fkey");
        });

        modelBuilder.Entity<Post>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("posts_pkey");

            entity.ToTable("posts");

            entity.HasIndex(e => e.AuthorId, "posts_author_id_idx");

            entity.Property(e => e.Id)
                .HasValueGenerator<UuidV4StringGenerator>()
                .HasColumnName("id");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Content).HasColumnName("content");
            entity.Property(e => e.Visibility)
                .ValueGeneratedNever()
                .HasDefaultValue(Visibility.LinkOnly)
                .HasColumnName("visibility");
            entity.Property(e => e.Published)
                .ValueGeneratedNever()
                .HasDefaultValue(false)
                .HasColumnName("published");
            entity.Property(e => e.ViewCount)
                .ValueGeneratedNever()
                .HasDefaultValue(0)
                .HasColumnName("view_count");
            entity.Property(e => e.AuthorId).HasColumnName("author_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("created_at");

            entity.HasOne(d => d.Author).WithMany(p => p.Posts)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("posts_author_id_fkey");

            entity.HasMany(d => d.Tags).WithMany(p => p.Posts)
                .UsingEntity<Dictionary<string, object>>(
                    "_PostToTag",
                    r => r.HasOne<Tag>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_PostToTag_B_fkey"),
                    l => l.HasOne<Post>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_PostToTag_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_PostToTag_AB_pkey");
                        j.ToTable("_PostToTag");
                        j.HasIndex(new[] { "B" }, "_PostToTag_B_index");
                    });
        });

        modelBuilder.Entity<Tag>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Tag_pkey");

            entity.ToTable("Tag");

            entity.HasIndex(e => e.Label, "Tag_label_key").IsUnique();

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Label).HasColumnName("label");
        });

        modelBuilder.Entity<Comment>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("comments_pkey");

            entity.ToTable("comments");

            entity.HasIndex(e => new { e.PostId, e.CreatedAt }, "comments_post_id_created_at_idx");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.PostId).HasColumnName("post_id");
            entity.Property(e => e.AuthorId).HasColumnName("author_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("created_at");

            entity.HasOne(d => d.Post).WithMany(p => p.Comments)
                .HasForeignKey(d => d.PostId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("comments_post_id_fkey");

            entity.HasOne(d => d.Author).WithMany(p => p.Comments)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("comments_author_id_fkey");
        });

        modelBuilder.Entity<Follow>(entity =>
        {
            entity.HasKey(e => new { e.FollowerId, e.FollowingId }).HasName("follows_pkey");

            entity.ToTable("follows");

            entity.Property(e => e.FollowerId).HasColumnName("follower_id");
            entity.Property(e => e.FollowingId).HasColumnName("following_id");
            entity.Property(e => e.Since)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("since");

            entity.HasOne(d => d.Follower).WithMany(p => p.Following)
                .HasForeignKey(d => d.FollowerId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("follows_follower_id_fkey");

            entity.HasOne(d => d.Following).WithMany(p => p.Followers)
                .HasForeignKey(d => d.FollowingId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("follows_following_id_fkey");
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Category_pkey");

            entity.ToTable("Category");

            entity.HasIndex(e => new { e.ParentId, e.Name }, "Category_parent_id_name_key").IsUnique();

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ParentId).HasColumnName("parent_id");

            entity.HasOne(d => d.Parent).WithMany(p => p.Children)
                .HasForeignKey(d => d.ParentId)
                .OnDelete(DeleteBehavior.SetNull)
                .HasConstraintName("Category_parent_id_fkey");
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("orders_pkey");

            entity.ToTable("orders");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Total)
                .HasPrecision(12, 2)
                .HasColumnName("total");
            entity.Property(e => e.PlacedAt)
                .HasDefaultValueSql("CURRENT_TIMESTAMP")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("placed_at");

            entity.HasOne(d => d.User).WithMany(p => p.Orders)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.Restrict)
                .HasConstraintName("orders_user_id_fkey");
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("order_items_pkey");

            entity.ToTable("order_items");

            entity.HasIndex(e => new { e.OrderId, e.Sku }, "order_items_order_id_sku_key").IsUnique();

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.OrderId).HasColumnName("order_id");
            entity.Property(e => e.Sku)
                .HasMaxLength(32)
                .HasColumnName("sku");
            entity.Property(e => e.Qty)
                .ValueGeneratedNever()
                .HasDefaultValue(1)
                .HasColumnName("qty");
            entity.Property(e => e.Price)
                .HasPrecision(12, 2)
                .HasColumnName("price");

            entity.HasOne(d => d.Order).WithMany(p => p.Items)
                .HasForeignKey(d => d.OrderId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("order_items_order_id_fkey");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_logs_pkey");

            entity.ToTable("audit_logs");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Action).HasColumnName("action");
            entity.Property(e => e.Payload)
                .ValueGeneratedNever()
                .HasDefaultValue("{}")
                .HasColumnType("jsonb")
                .HasColumnName("payload");
            entity.Property(e => e.Signature).HasColumnName("signature");
            entity.Property(e => e.LoggedAt)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp(3) without time zone")
                .HasColumnName("logged_at");
        });

        modelBuilder.Entity<Actor>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Actor_pkey");

            entity.ToTable("Actor");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Name).HasColumnName("name");

            entity.HasMany(d => d.Films).WithMany(p => p.Actors)
                .UsingEntity<Dictionary<string, object>>(
                    "_cast",
                    r => r.HasOne<Film>().WithMany()
                        .HasForeignKey("B")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_cast_B_fkey"),
                    l => l.HasOne<Actor>().WithMany()
                        .HasForeignKey("A")
                        .OnDelete(DeleteBehavior.Cascade)
                        .HasConstraintName("_cast_A_fkey"),
                    j =>
                    {
                        j.HasKey("A", "B").HasName("_cast_AB_pkey");
                        j.ToTable("_cast");
                        j.HasIndex(new[] { "B" }, "_cast_B_index");
                    });
        });

        modelBuilder.Entity<Film>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("Film_pkey");

            entity.ToTable("Film");

            entity.Property(e => e.Id)
                .UseSerialColumn()
                .HasColumnName("id");
            entity.Property(e => e.Title).HasColumnName("title");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampUpdatedAt();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampUpdatedAt();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    private void StampUpdatedAt()
    {
        var now = DateTime.UtcNow;
        foreach (var entry in ChangeTracker.Entries<User>())
        {
            if ((entry.State == EntityState.Added && entry.Entity.UpdatedAt == default)
                || (entry.State == EntityState.Modified && !entry.Property(e => e.UpdatedAt).IsModified))
            {
                entry.Entity.UpdatedAt = DateTime.SpecifyKind(now, DateTimeKind.Unspecified);
            }
        }
    }
}

file sealed class UuidV7StringGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Guid.CreateVersion7().ToString();
}

file sealed class Cuid2Generator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => new Cuid2().ToString();
}

file sealed class UuidV4StringGenerator : ValueGenerator<string>
{
    public override bool GeneratesTemporaryValues => false;

    public override string Next(EntityEntry entry) => Guid.NewGuid().ToString();
}
