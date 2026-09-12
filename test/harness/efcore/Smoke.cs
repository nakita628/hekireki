using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Models;
using Npgsql;
using NpgsqlTypes;

// Reads and writes a database Prisma Migrate created, through the generated model, and checks each
// row against what Prisma itself would have stored: the raw column values, not what EF Core reads
// back from its own writes.
public static class Smoke
{
    static int checks;

    static void Check(bool condition, string what)
    {
        checks++;
        if (!condition) throw new InvalidOperationException($"check failed: {what}");
    }

    static void Throws<TException>(Action action, string what) where TException : Exception
    {
        checks++;
        try
        {
            action();
        }
        catch (TException)
        {
            return;
        }
        throw new InvalidOperationException($"expected {typeof(TException).Name}: {what}");
    }

    static object? Scalar(AppDbContext context, string sql)
    {
        var connection = context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        var value = command.ExecuteScalar();
        return value is DBNull ? null : value;
    }

    public static int Run(DbContextOptions<AppDbContext> options)
    {
        AppDbContext open() => new(options);
        Accounts(open);
        Profiles(open);
        Categories(open);
        ManyToMany(open);
        GeneratedIds(open);
        Defaults(open);
        NativeTypes(open);
        ReferentialActions(open);
        AlternateAndCompositeKeys(open);
        Monarchs(open);
        EnumsAndLists(open);
        DatabaseDefaults(open);
        Pooling(options);
        Console.WriteLine($"ok: {checks} checks against the Prisma-created database");
        return 0;
    }

    static Account NewAccount() => new()
    {
        BigNum = 9_007_199_254_740_993L,
        Price = 12345.678901234567890123456789m,
        Data = """{"k": "v"}""",
        Raw = [1, 2, 3],
        Ratio = 0.5,
        Flag = true,
        Count = 7,
    };

    static void Accounts(Func<AppDbContext> open)
    {
        string id;
        using (var context = open())
        {
            var account = NewAccount();
            context.Accounts.Add(account);
            context.SaveChanges();
            id = account.Id;
            Check(Regex.IsMatch(id, "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"), "uuid() is a v4 UUID string");
            Check(account.CreatedAt != default, "now() comes back from the database");
            Check((string?)Scalar(context, $"SELECT status::text FROM accounts WHERE id = '{id}'") == "ACTIVE", "@default(ACTIVE) stores ACTIVE");
            Check(Scalar(context, $"SELECT tags FROM accounts WHERE id = '{id}'") is null, "an unset scalar list stays NULL");
            Check((bool)Scalar(context, $"SELECT created_at > now() - interval '1 minute' FROM accounts WHERE id = '{id}'")!, "created_at is the database's now()");
        }
        using (var context = open())
        {
            // Prisma's default Decimal column is numeric(65,30): every value in it carries 30 decimal
            // places, more than System.Decimal's 28, and Npgsql refuses to read any of them. The
            // README tells users to declare @db.Decimal(p, s) with s <= 28; this pins that limit.
            Throws<OverflowException>(() => context.Accounts.Single(a => a.Id == id), "Npgsql cannot read numeric(65,30) into System.Decimal");
            Check((string?)Scalar(context, $"SELECT trim_scale(price)::text FROM accounts WHERE id = '{id}'") == "12345.678901234567890123456789", "Decimal(65,30) stores every digit written");
            var read = context.Accounts.Where(a => a.Id == id).Select(a => new { a.BigNum, a.Raw, a.Status }).Single();
            Check(read.BigNum == 9_007_199_254_740_993L, "BigInt past 2^53 round-trips");
            Check(read.Raw.SequenceEqual(new byte[] { 1, 2, 3 }), "Bytes round-trips");
            Check(read.Status == Status.Active, "the enum reads back");
            context.Accounts.Where(a => a.Id == id).ExecuteUpdate(a => a.SetProperty(x => x.Status, Status.PendingReview).SetProperty(x => x.Tags, new List<string> { "x", "y" }));
            Check((string?)Scalar(context, $"SELECT status::text FROM accounts WHERE id = '{id}'") == "PENDING_REVIEW", "a PgName-mapped member is written by its label");
            Check((string?)Scalar(context, $"SELECT tags::text FROM accounts WHERE id = '{id}'") == "{x,y}", "a scalar list is a text[]");
            Check(context.Accounts.Any(a => a.Tags!.Contains("y")), "a list is queryable");
        }
    }

    static void Profiles(Func<AppDbContext> open)
    {
        using var context = open();
        var account = NewAccount();
        context.Accounts.Add(account);
        var profile = new Profile { Account = account, LastSeen = new DateTime(2024, 1, 2, 3, 4, 5, DateTimeKind.Utc) };
        context.Profiles.Add(profile);
        var before = DateTime.UtcNow;
        context.SaveChanges();
        Check(Regex.IsMatch(profile.Id, "^c[a-z0-9]{24}$"), "cuid() is a 25-character CUID");
        Check(profile.Nickname == "anonymous" && profile.Score == 0 && profile.Balance == 0 && !profile.Verified, "literal defaults are set on new entities");
        Check(profile.UpdatedAt >= before.AddSeconds(-1) && profile.UpdatedAt.Kind == DateTimeKind.Unspecified, "@updatedAt is stamped on insert, as UTC");
        var stored = (DateTime)Scalar(context, $"SELECT updated_at FROM \"Profile\" WHERE id = '{profile.Id}'")!;
        Check(Math.Abs((stored - before).TotalSeconds) < 60, "@updatedAt is stored as UTC, as Prisma stores it");
        Check((string?)Scalar(context, $"SELECT nickname FROM \"Profile\" WHERE id = '{profile.Id}'") == "anonymous", "the default is written");
        Check((string?)Scalar(context, $"SELECT \"lastSeen\"::text FROM \"Profile\" WHERE id = '{profile.Id}'") is string lastSeen && lastSeen.StartsWith("2024-01-02 03:04:05", StringComparison.Ordinal), "timestamptz stores the UTC instant");

        var first = profile.UpdatedAt;
        System.Threading.Thread.Sleep(20);
        profile.Bio = "changed";
        context.SaveChanges();
        Check(profile.UpdatedAt > first, "@updatedAt moves on update");
        var pinned = new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Unspecified);
        profile.Bio = "again";
        profile.UpdatedAt = pinned;
        context.SaveChanges();
        Check(profile.UpdatedAt == pinned, "an @updatedAt the write sets is kept");

        Check(context.Accounts.Where(a => a.Id == account.Id).Select(a => a.Profile!.Id).Single() == profile.Id, "one-to-one navigates from the principal");

        profile.Nickname = "nick";
        context.SaveChanges();
        var clash = new Profile { AccountId = account.Id, Nickname = "other" };
        context.Profiles.Add(clash);
        Throws<DbUpdateException>(() => context.SaveChanges(), "@unique(accountId) holds");
    }

    static void Categories(Func<AppDbContext> open)
    {
        int parentId, childId;
        using (var context = open())
        {
            var parent = new Category { Name = "root" };
            var child = new Category { Name = "leaf", Parent = parent };
            context.AddRange(parent, child);
            context.SaveChanges();
            parentId = parent.Id;
            childId = child.Id;
            Check(parentId > 0 && childId > parentId, "autoincrement ids come from the serial sequence");
        }
        using (var context = open())
        {
            Check(context.Categories.Include(c => c.Children).Single(c => c.Id == parentId).Children.Single().Id == childId, "self-relation loads its children");
            context.Categories.Remove(context.Categories.Single(c => c.Id == parentId));
            context.SaveChanges();
            Check(Scalar(context, $"SELECT \"parentId\" FROM \"Category\" WHERE id = {childId}") is null, "onDelete SetNull (the default for an optional relation) nulls the child");
        }
    }

    static void ManyToMany(Func<AppDbContext> open)
    {
        using var context = open();
        var author = NewAccount();
        var post = new Post { Title = "t", Author = author };
        var tag = new Tag { Label = $"tag-{Guid.NewGuid()}" };
        post.Tags.Add(tag);
        context.Add(post);
        context.SaveChanges();
        Check((long)Scalar(context, $"SELECT count(*) FROM \"_PostToTag\" WHERE \"A\" = '{post.Id}' AND \"B\" = '{tag.Id}'")! == 1, "_PostToTag stores the post in A and the tag in B");

        var actor = new Actor();
        var film = new Film();
        film.Actors.Add(actor);
        context.AddRange(actor, film);
        context.SaveChanges();
        Check((long)Scalar(context, $"SELECT count(*) FROM \"_cast\" WHERE \"A\" = {actor.Id} AND \"B\" = {film.Id}")! == 1, "a named relation uses _<name>, A for the model that sorts first");

        using var fresh = open();
        Check(fresh.Tags.Include(t => t.Posts).Single(t => t.Id == tag.Id).Posts.Single().Id == post.Id, "the other side of the join reads back");

        context.Tags.Remove(tag);
        context.SaveChanges();
        Check((long)Scalar(context, $"SELECT count(*) FROM \"_PostToTag\" WHERE \"A\" = '{post.Id}'")! == 0, "join rows cascade with either side");

        var follower = NewAccount();
        var followed = NewAccount();
        context.AddRange(follower, followed);
        context.Add(new Follow { Follower = follower, Following = followed });
        context.SaveChanges();
        using var check = open();
        Check(check.Accounts.Where(a => a.Id == followed.Id).SelectMany(a => a.Followers).Single().FollowerId == follower.Id, "followers are the Follow rows pointing at the account");
        Check(check.Accounts.Where(a => a.Id == follower.Id).SelectMany(a => a.Following).Single().FollowingId == followed.Id, "following are the Follow rows the account made");
    }

    static void GeneratedIds(Func<AppDbContext> open)
    {
        using var context = open();
        var first = new Event { Name = "a", Happens = new DateTime(2024, 1, 1) };
        context.Add(first);
        context.SaveChanges();
        var second = new Event { Name = "b", Happens = new DateTime(2024, 1, 1) };
        context.Add(second);
        context.SaveChanges();
        Check(Regex.IsMatch(first.Id, "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"), "uuid(7) is a v7 UUID string");
        Check(string.CompareOrdinal(first.Id, second.Id) < 0, "v7 ids are ordered by creation");

        var ticket = new Ticket { Label = "t" };
        context.Add(ticket);
        context.SaveChanges();
        Check(Regex.IsMatch(ticket.Id, "^[0-9A-HJKMNP-TV-Z]{26}$"), "ulid() is a 26-character Crockford ULID");

        var coupon = new Coupon { Name = "c" };
        context.Add(coupon);
        context.SaveChanges();
        Check(Regex.IsMatch(coupon.Id, "^[A-Za-z0-9_-]{10}$"), "nanoid(10) is 10 URL-safe characters");

        var explicitId = new Ticket { Id = "01ARZ3NDEKTSV4RRFFQ69G5FAV", Label = "mine" };
        context.Add(explicitId);
        context.SaveChanges();
        Check(explicitId.Id == "01ARZ3NDEKTSV4RRFFQ69G5FAV", "an id the caller sets is kept");

        var badge = new Badge { Name = "b" };
        context.Add(badge);
        context.SaveChanges();
        Check(Regex.IsMatch(badge.Id, "^[a-z][a-z0-9]{23}$"), "cuid(2) is a 24-character CUID2");

        var sequence = new Sequence { Name = "s" };
        context.Add(sequence);
        context.SaveChanges();
        Check(sequence.Id > 0, "BigInt autoincrement is bigserial");

        var keyword = new Keyword { Type = "t", Match = "m", Async = "a", Yield = "y", Self = "s" };
        context.Add(keyword);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT \"self\" FROM \"Keyword\" WHERE id = '{keyword.Id}'") == "s", "reserved-word columns keep their names");

        var word = new MachineWord { Metadata = "m", Registry = "r", TableName = "t" };
        context.Add(word);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT \"tableName\" FROM machine_words WHERE id = {word.Id}") == "t", "@@map tables and ORM-ish column names");

        var item = new OrderLineItem { SkuCode = "sku" };
        var zero = new OrderLineItem { SkuCode = "zero", Qty = 0 };
        context.AddRange(item, zero);
        context.SaveChanges();
        Check((int)Scalar(context, $"SELECT qty FROM order_line_item WHERE id = {item.Id}")! == 1, "@default(1) applies when unset");
        Check((int)Scalar(context, $"SELECT qty FROM order_line_item WHERE id = {zero.Id}")! == 0, "an explicit 0 is stored, not replaced by the default");
    }

    static void Defaults(Func<AppDbContext> open)
    {
        using var context = open();
        // Every literal default: the row EF Core writes for a new entity must equal the row the
        // database fills from its own DEFAULT clauses.
        var torture = new Torture();
        context.Add(torture);
        context.SaveChanges();
        var dbDefault = (int)Scalar(context, "INSERT INTO \"Torture\" DEFAULT VALUES RETURNING id")!;
        var columns = new[] { "negInt", "negFloat", "bigPos", "bigNeg", "precise", "born", "jsonObj", "jsonArr", "jsonStr", "quoted", "unicode", "empty", "zero", "offFlag" };
        foreach (var column in columns)
        {
            var ours = Scalar(context, $"SELECT \"{column}\"::text FROM \"Torture\" WHERE id = {torture.Id}");
            var theirs = Scalar(context, $"SELECT \"{column}\"::text FROM \"Torture\" WHERE id = {dbDefault}");
            Check(Equals(ours, theirs), $"Torture.{column}: {ours} is the database default {theirs}");
        }

        var flipped = new Torture { NegInt = 0, OffFlag = true, Zero = 5, Empty = "set", Quoted = "" };
        context.Add(flipped);
        context.SaveChanges();
        Check((int)Scalar(context, $"SELECT \"negInt\" FROM \"Torture\" WHERE id = {flipped.Id}")! == 0, "a default-valued column takes an explicit CLR default");
        Check((string?)Scalar(context, $"SELECT quoted FROM \"Torture\" WHERE id = {flipped.Id}") == "", "an explicit empty string is not the default");
    }

    static void NativeTypes(Func<AppDbContext> open)
    {
        Guid id;
        var mask = new BitArray(new[] { true, false, true, false, true, false, true, false });
        var varMask = new BitArray(new[] { true, true, false });
        using (var context = open())
        {
            var grid = new NativeGrid
            {
                Code = "abc",
                Label = "label",
                Tiny = short.MaxValue,
                Ordinary = int.MinValue,
                Ident = uint.MaxValue,
                Single = 1.5f,
                Double = Math.PI,
                Wealth = 1234.56m,
                Exact = 12345678901234.123456789012m,
                Blobby = [0, 255],
                Doc = """{"b": 1, "a": 2}""",
                Plain = """{"b":1,  "a":2}""",
                Day = new DateOnly(2024, 2, 29),
                Clock = new TimeOnly(13, 14, 15, 123),
                Stamp = new DateTime(2024, 1, 1, 12, 0, 0, 400),
                Zoned = new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc),
                Address = new NpgsqlInet("10.1.0.0/16"),
                Mask = mask,
                VarMask = varMask,
                Markup = "<a>1</a>",
                BigCount = long.MaxValue,
                Flagged = true,
            };
            context.Add(grid);
            context.SaveChanges();
            id = grid.Id;
            Check(id.ToString()[14] == '4', "uuid() on @db.Uuid is a v4 Guid");
            Check((string?)Scalar(context, $"SELECT address::text FROM \"NativeGrid\" WHERE id = '{id}'") == "10.1.0.0/16", "inet keeps its netmask");
            Check((string?)Scalar(context, $"SELECT stamp::text FROM \"NativeGrid\" WHERE id = '{id}'") == "2024-01-01 12:00:00", "timestamp(0) rounds like PostgreSQL");
            Check((string?)Scalar(context, $"SELECT plain::text FROM \"NativeGrid\" WHERE id = '{id}'") == """{"b":1,  "a":2}""", "json keeps the text as written");
            Check((string?)Scalar(context, $"SELECT mask::text FROM \"NativeGrid\" WHERE id = '{id}'") == "10101010", "bit(8)");
            Check((string?)Scalar(context, $"SELECT wealth::numeric::text FROM \"NativeGrid\" WHERE id = '{id}'") == "1234.56", "money");
        }
        using (var context = open())
        {
            var grid = context.NativeGrids.Single(g => g.Id == id);
            Check(grid.Code == "abc" && grid.Ident == uint.MaxValue && grid.Tiny == short.MaxValue, "char / oid / smallint");
            Check(grid.Exact == 12345678901234.123456789012m, "decimal(38,12)");
            Check(grid.Address.Netmask == 16 && grid.Address.Address.ToString() == "10.1.0.0", "inet reads back with its netmask");
            Check(grid.Mask.Length == 8 && grid.Mask[0] && !grid.Mask[1], "bit(8) reads back");
            Check(grid.VarMask.Length == 3, "varbit keeps its length");
            Check(grid.Day == new DateOnly(2024, 2, 29) && grid.Clock == new TimeOnly(13, 14, 15, 123), "date / time(3)");
            Check(grid.Zoned == new DateTime(2024, 1, 1, 12, 0, 0, DateTimeKind.Utc) && grid.Zoned.Kind == DateTimeKind.Utc, "timestamptz reads back as UTC");
            Check(grid.Markup == "<a>1</a>" && grid.Double == Math.PI && grid.Single == 1.5f, "xml / double / real");
        }
    }

    static void ReferentialActions(Func<AppDbContext> open)
    {
        using (var context = open())
        {
            // The database's SetDefault target: setDefaultId defaults to 1.
            context.Database.ExecuteSqlRaw("INSERT INTO \"RefActionParent\" (id) VALUES (1); SELECT setval(pg_get_serial_sequence('\"RefActionParent\"', 'id'), 1)");
        }

        (RefActionParent parent, RefActionChild child) Seed(AppDbContext context)
        {
            var parent = new RefActionParent();
            context.Add(parent);
            context.SaveChanges();
            var anchor = context.RefActionParents.Single(p => p.Id == 1);
            var child = new RefActionChild { Cascade = anchor, Restrict = anchor, NoAction = anchor, SetDefault = anchor };
            context.Add(child);
            context.SaveChanges();
            return (parent, child);
        }

        using (var context = open())
        {
            var (parent, child) = Seed(context);
            child.Cascade = parent;
            context.SaveChanges();
            context.ChangeTracker.Clear();
            context.RefActionParents.Where(p => p.Id == parent.Id).ExecuteDelete();
            Check(!context.RefActionChildren.Any(c => c.Id == child.Id), "onDelete Cascade deletes in the database");
        }
        using (var context = open())
        {
            var (parent, child) = Seed(context);
            child.SetNull = parent;
            context.SaveChanges();
            context.ChangeTracker.Clear();
            context.RefActionParents.Where(p => p.Id == parent.Id).ExecuteDelete();
            Check(context.RefActionChildren.Single(c => c.Id == child.Id).SetNullId is null, "onDelete SetNull nulls in the database");
        }
        using (var context = open())
        {
            var (parent, child) = Seed(context);
            child.Restrict = parent;
            context.SaveChanges();
            context.ChangeTracker.Clear();
            var loaded = context.RefActionParents.Include(p => p.Restricts).Single(p => p.Id == parent.Id);
            Throws<InvalidOperationException>(() =>
            {
                context.Remove(loaded);
                context.SaveChanges();
            }, "onDelete Restrict refuses a tracked dependent");
            context.ChangeTracker.Clear();
            context.Remove(context.RefActionParents.Single(p => p.Id == parent.Id));
            Throws<DbUpdateException>(() => context.SaveChanges(), "onDelete Restrict refuses in the database");
        }
        using (var context = open())
        {
            var (parent, child) = Seed(context);
            child.NoAction = parent;
            context.SaveChanges();
            context.ChangeTracker.Clear();
            context.Remove(context.RefActionParents.Single(p => p.Id == parent.Id));
            Throws<DbUpdateException>(() => context.SaveChanges(), "onDelete NoAction refuses in the database");
        }
        using (var context = open())
        {
            var (parent, child) = Seed(context);
            child.SetDefault = parent;
            context.SaveChanges();
            // Even with the dependent tracked, EF Core leaves the row to the database (ClientNoAction),
            // which moves it to the column default.
            var loaded = context.RefActionParents.Include(p => p.Defaults).Single(p => p.Id == parent.Id);
            context.Remove(loaded);
            context.SaveChanges();
            Check((int)Scalar(context, $"SELECT \"setDefaultId\" FROM \"RefActionChild\" WHERE id = {child.Id}")! == 1, "onDelete SetDefault sets the default in the database");
        }
    }

    static void AlternateAndCompositeKeys(Func<AppDbContext> open)
    {
        using var context = open();
        var handle = new Handle { Slug = $"slug-{Guid.NewGuid()}" };
        handle.Claims.Add(new Claim());
        context.Add(handle);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT slug FROM \"Claim\" WHERE id = {handle.Claims.Single().Id}") == handle.Slug, "a foreign key to a unique non-id column stores that column");

        var warehouse = new Warehouse { Country = "JP", Code = $"W{Guid.NewGuid():N}" };
        warehouse.Stocks.Add(new Stock { Amount = 3 });
        context.Add(warehouse);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT country || '/' || code FROM \"Stock\" WHERE id = {warehouse.Stocks.Single().Id}") == $"JP/{warehouse.Code}", "a composite foreign key to @@unique stores both columns");

        var cell = new GridCell { X = 1, Y = 2 };
        cell.Marks.Add(new Mark());
        context.Add(cell);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT x || ',' || y FROM \"Mark\" WHERE id = {cell.Marks.Single().Id}") == "1,2", "a composite foreign key to @@id stores both columns");

        context.ChangeTracker.Clear();
        context.Handles.Where(h => h.Id == handle.Id).ExecuteDelete();
        Check(!context.Claims.Any(c => c.Slug == handle.Slug), "onDelete Cascade on the slug relation");
    }

    static void Monarchs(Func<AppDbContext> open)
    {
        using var context = open();
        var elder = new Monarch { Name = "elder" };
        var younger = new Monarch { Name = "younger" };
        elder.Successor = younger;
        context.AddRange(elder, younger);
        context.SaveChanges();
        using var fresh = open();
        Check(fresh.Monarches.Include(m => m.Predecessor).Single(m => m.Id == younger.Id).Predecessor!.Id == elder.Id, "a one-to-one self-relation reads both ends");
        Check((int)Scalar(context, $"SELECT \"successorId\" FROM \"Monarch\" WHERE id = {elder.Id}")! == younger.Id, "successorId holds the successor");
    }

    static void EnumsAndLists(Func<AppDbContext> open)
    {
        using var context = open();
        var board = new Board { Audiences = [Visibility.Public, Visibility.LinkOnly] };
        context.Add(board);
        context.SaveChanges();
        Check((string?)Scalar(context, $"SELECT visibility::text FROM \"Board\" WHERE id = {board.Id}") == "link_only", "a mapped enum default stores the @map value");
        Check((string?)Scalar(context, $"SELECT audiences::text FROM \"Board\" WHERE id = {board.Id}") == "{public,link_only}", "an enum list is a visibility_level[]");
        Check(context.Boards.Count(b => b.Visibility == Visibility.LinkOnly && b.Id == board.Id) == 1, "enums are comparable in queries");

        var inventory = new Inventory
        {
            Weights = [1.5],
            Flags = [true, false],
            Stamps = [new DateTime(2024, 1, 1, 0, 0, 0, 123)],
            Bigs = [long.MinValue],
            Decs = [0.0000000000000000000000000001m],
        };
        context.Add(inventory);
        context.SaveChanges();
        var dbDefault = (int)Scalar(context, "INSERT INTO \"Inventory\" DEFAULT VALUES RETURNING id")!;
        foreach (var column in new[] { "tags", "codes", "labels" })
        {
            Check(Equals(Scalar(context, $"SELECT {column}::text FROM \"Inventory\" WHERE id = {inventory.Id}"), Scalar(context, $"SELECT {column}::text FROM \"Inventory\" WHERE id = {dbDefault}")), $"list default {column}");
        }
        using var fresh = open();
        var read = fresh.Inventories.Where(i => i.Id == inventory.Id).Select(i => new { i.Stamps, i.Codes }).Single();
        Check(read.Stamps!.Single() == new DateTime(2024, 1, 1, 0, 0, 0, 123), "timestamp(3)[] round-trips");
        Check((string?)Scalar(context, $"SELECT trim_scale(decs[1])::text FROM \"Inventory\" WHERE id = {inventory.Id}") == "0.0000000000000000000000000001", "decimal(65,30)[] stores every digit");
        Check(read.Codes!.SequenceEqual(new[] { 1, 2, 3 }), "Int[] @default([1, 2, 3])");
    }

    // A pooled context (AddDbContextPool) must not change its options in OnConfiguring; the
    // generated context leaves the options to MapEnums, which the caller passes to UseNpgsql.
    static void Pooling(DbContextOptions<AppDbContext> options)
    {
        var factory = new PooledDbContextFactory<AppDbContext>(options, poolSize: 1);
        foreach (var round in new[] { 1, 2 })
        {
            using var context = factory.CreateDbContext();
            context.Boards.Add(new Board { Audiences = [Visibility.Private] });
            context.SaveChanges();
            Check(context.Boards.Any(b => b.Audiences!.Contains(Visibility.Private)), $"a pooled context maps the enums, use {round}");
        }
    }

    static void DatabaseDefaults(Func<AppDbContext> open)
    {
        using var context = open();
        var computed = new Computed();
        context.Add(computed);
        context.SaveChanges();
        Check(computed.Id != Guid.Empty, "dbgenerated(gen_random_uuid()) comes back from the database");
        Check(computed.When > DateTime.UtcNow, "dbgenerated(now() + interval '1 day')");
        Check(Regex.IsMatch(computed.Code, "^[0-9a-f]{32}$"), "dbgenerated(md5(...))");
    }
}
