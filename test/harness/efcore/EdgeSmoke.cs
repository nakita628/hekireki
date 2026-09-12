using System;
using System.Collections;
using System.Linq;
using System.Text.RegularExpressions;
using Hekireki.Edge;
using Microsoft.EntityFrameworkCore;

// The hazards of test/prisma/efcore.prisma, exercised on the database Prisma Migrate creates for it.
public static class EdgeSmoke
{
    static int checks;

    static void Check(bool condition, string what)
    {
        checks++;
        if (!condition) throw new InvalidOperationException($"check failed: {what}");
    }

    static object? Scalar(EdgeContext context, string sql)
    {
        var connection = context.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        var value = command.ExecuteScalar();
        return value is DBNull ? null : value;
    }

    static string? Text(EdgeContext context, string sql) => (string?)Scalar(context, sql);

    public static int Run(Func<EdgeContext> open)
    {
        Names(open);
        Tasks(open);
        SelfManyToMany(open);
        Keys(open);
        SharedKey(open);
        BareTypes(open);
        Defaults(open);
        Console.WriteLine($"ok: {checks} checks against the Prisma-created edge database");
        return 0;
    }

    static void Names(Func<EdgeContext> open)
    {
        using var context = open();
        context.OrderItems.Add(new OrderItem { Id = 1 });
        context.OrderItem1s.Add(new OrderItem1 { Id = 2 });
        context.People.Add(new Person { Id = 3 });
        context.People1.Add(new People { Id = 4 });
        context.SaveChanges();
        Check((int)Scalar(context, "SELECT id FROM order_item")! == 1 && (int)Scalar(context, "SELECT id FROM \"OrderItem\"")! == 2, "order_item and OrderItem are two classes, two tables");
        Check((int)Scalar(context, "SELECT id FROM \"Person\"")! == 3 && (int)Scalar(context, "SELECT id FROM \"People\"")! == 4, "Person and People are two DbSets");

        var owner = new Hekireki.Edge.DeleteBehavior { Id = 10, Name = "owner" };
        owner.Lists.Add(new List());
        context.Add(owner);
        context.SaveChanges();
        Check(owner.Lists.Single().Id > 0, "a SmallInt autoincrement key is a smallserial");
        context.Remove(owner);
        context.SaveChanges();
        Check((long)Scalar(context, "SELECT count(*) FROM \"List\"")! == 0, "onDelete Cascade on a model named List");
    }

    static void Tasks(Func<EdgeContext> open)
    {
        using var context = open();
        var task = new Hekireki.Edge.Task { Task1 = "write" };
        var before = DateTime.UtcNow;
        context.Tasks.Add(task);
        context.SaveChanges();
        var id = task.Id;
        Check(Text(context, $"SELECT status::text FROM tasks WHERE id = {id}") == "low", "the Level default under a property named Status");
        Check(Text(context, $"SELECT mood::text FROM tasks WHERE id = {id}") == "ACTIVE", "the Status default the property shadows");
        Check((int)Scalar(context, $"SELECT \"userId\" + 10 * \"UserId\" FROM tasks WHERE id = {id}")! == 10, "userId and UserId are two columns");
        Check(Text(context, $"SELECT convert_from(\"convert\", 'UTF8') FROM tasks WHERE id = {id}") == "hello", "a Bytes default from a property named Convert");
        Check(task.UpdatedAt.Kind == DateTimeKind.Utc && task.UpdatedAt >= before.AddSeconds(-1), "@updatedAt on timestamptz is a UTC DateTime");
        Check(task.SeenOn == DateOnly.FromDateTime(DateTime.UtcNow) || task.SeenOn == DateOnly.FromDateTime(before), "@updatedAt on a date is today");

        task.Status = Level.FooBar1;
        context.SaveChanges();
        Check(Text(context, $"SELECT status::text FROM tasks WHERE id = {id}") == "foo-bar", "FooBar1 is the value mapped to foo-bar");
        Check(context.Tasks.Count(t => t.Status == Level.FooBar1 && t.Id == id) == 1, "and reads back as FooBar1");
    }

    static void SelfManyToMany(Func<EdgeContext> open)
    {
        using var context = open();
        var ann = new Member { Handle = "ann" };
        var bob = new Member { Handle = "bob" };
        ann.Friends.Add(bob);
        context.AddRange(ann, bob);
        context.SaveChanges();
        Check(ann.Id.ToString()[14] == '7', "uuid(7) on @db.Uuid is a v7 Guid");
        // friendOf sorts before friends, so friendOf is the side that lists column B: ann.friends
        // holding bob is the row where bob's friendOf holds ann.
        Check((long)Scalar(context, $"SELECT count(*) FROM audit._friendship WHERE \"A\" = '{bob.Id}' AND \"B\" = '{ann.Id}'")! == 1, "_friendship stores the pair the way Prisma does");
        using var fresh = open();
        Check(fresh.Members.Include(m => m.FriendOf).Single(m => m.Id == bob.Id).FriendOf.Single().Id == ann.Id, "and the other side reads it back");

        var badge = new Badge { Member = ann };
        context.Add(badge);
        context.SaveChanges();
        Check(Text(context, $"SELECT \"memberHandle\" FROM audit.\"Badge\" WHERE id = {badge.Id}") == "ann", "a one-to-one to a unique column stores that column");
        Check(fresh.Members.Include(m => m.Badge).Single(m => m.Id == ann.Id).Badge!.Id == badge.Id, "and navigates from the principal");

        var article = new Article { Id = 1 };
        var label = new Label { Id = "news" };
        article.Labels.Add(label);
        context.Add(article);
        context.SaveChanges();
        Check((long)Scalar(context, "SELECT count(*) FROM public.\"_ArticleToLabel\" WHERE \"A\" = 1 AND \"B\" = 'news'")! == 1, "a join table across schemas lives in the schema of A");

        var longOne = new AnExceedinglyLongModelNameThatKeepsGoingAndGoing { AnExceedinglyLongColumnNameThatAlsoKeepsGoing = 1 };
        longOne.Others.Add(new AnotherExceedinglyLongModelNameThatKeepsGoing());
        context.Add(longOne);
        context.SaveChanges();
        Check((long)Scalar(context, "SELECT count(*) FROM \"_AnExceedinglyLongModelNameThatKeepsGoingAndGoingToAnotherExcee\"")! == 1, "a join table whose name Prisma cut to 63 characters");
    }

    static void Keys(Func<EdgeContext> open)
    {
        using var context = open();
        var tile = new Tile { X = 1, Y = 2 };
        tile.Pins.Add(new Pin());
        context.Add(tile);
        context.SaveChanges();
        Check(Text(context, "SELECT a || ',' || b FROM \"Pin\"") == "1,2", "fields [b, a] references [y, x]: a holds x, b holds y");

        context.Add(new Keyless { Code = "k", Label = "one" });
        context.SaveChanges();
        var keyless = context.Keylesses.Single(k => k.Code == "k");
        keyless.Label = "two";
        context.SaveChanges();
        Check(Text(context, "SELECT label FROM \"Keyless\" WHERE code = 'k'") == "two", "a model keyed by @unique updates by it");

        var first = new Ledger { Book = "b" };
        var second = new Ledger { Book = "b" };
        context.AddRange(first, second);
        context.SaveChanges();
        Check(first.Seq > 0 && second.Seq > first.Seq, "an autoincrement column of a composite key comes from its sequence");
        Check((decimal)Scalar(context, $"SELECT total FROM \"Ledger\" WHERE seq = {first.Seq}")! == 0m, "Decimal(18, 2) default");
    }

    static void SharedKey(Func<EdgeContext> open)
    {
        string id;
        using (var context = open())
        {
            var wallet = new Wallet { Owner = new WalletOwner { Name = "ann" } };
            context.Add(wallet);
            context.SaveChanges();
            id = wallet.Id;
            Check(Regex.IsMatch(id, "^w-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"), $"a text key the database fills in comes back from it ({id})");
            Check(Text(context, $"SELECT \"walletId\" FROM \"WalletOwner\" WHERE name = 'ann'") == id, "the dependent shares the principal's key");
        }
        using (var context = open())
        {
            Check(context.Wallets.Include(w => w.Owner).Single(w => w.Id == id).Owner!.Name == "ann", "and loads through it");
            context.Wallets.Where(w => w.Id == id).ExecuteDelete();
            Check((long)Scalar(context, "SELECT count(*) FROM \"WalletOwner\"")! == 0, "onDelete Cascade through a shared key");
        }
    }

    static void BareTypes(Func<EdgeContext> open)
    {
        int id;
        using (var context = open())
        {
            var bare = new Bare
            {
                Varying = "any length",
                Fixed = "x",
                Flag = new BitArray(new[] { true }),
                Bits = new BitArray(new[] { false, true, true }),
                Stamp = new DateTime(2024, 5, 6, 7, 8, 9, 123, 456),
                Zoned = new DateTime(2024, 5, 6, 7, 8, 9, DateTimeKind.Utc),
                Clock = new TimeOnly(23, 59, 59, 999, 999),
                ZonedTime = new DateTimeOffset(1, 1, 2, 10, 20, 30, 400, TimeSpan.FromHours(9)),
                Exact = 1.5m,
                Names = ["a", "b"],
                Docs = ["""{"a": 1}"""],
                Blobs = [[1, 2]],
                Ids = [Guid.Empty],
                Days = [new DateOnly(2024, 1, 31)],
            };
            context.Add(bare);
            context.SaveChanges();
            id = bare.Id;
            Check(Text(context, $"SELECT levels::text FROM \"Bare\" WHERE id = {id}") == "{FOO_BAR,low}", "an enum list default");
            Check(Text(context, $"SELECT flag::text || '/' || bits::text FROM \"Bare\" WHERE id = {id}") == "1/011", "bit and varbit without a length");
            Check(Text(context, $"SELECT stamp::text FROM \"Bare\" WHERE id = {id}") == "2024-05-06 07:08:09.123456", "timestamp without a precision keeps microseconds");
            Check(Text(context, $"SELECT \"zonedTime\"::text FROM \"Bare\" WHERE id = {id}") == "10:20:30.4+09", "timetz(3)");
        }
        using (var context = open())
        {
            var bare = context.Bares.Single(b => b.Id == id);
            Check(bare.Exact == 1.5m, "Decimal without a precision is an unconstrained numeric, readable as decimal");
            Check(bare.Fixed == "x" && bare.Varying == "any length", "char and varchar without a length");
            Check(bare.Clock == new TimeOnly(23, 59, 59, 999, 999), "time without a precision keeps microseconds");
            Check(bare.Names!.SequenceEqual(new[] { "a", "b" }) && bare.Blobs!.Single().SequenceEqual(new byte[] { 1, 2 }) && bare.Ids!.Single() == Guid.Empty && bare.Days!.Single() == new DateOnly(2024, 1, 31), "lists of varchar, bytea, uuid and date");
            Check(bare.ZonedTime.Offset == TimeSpan.FromHours(9) && bare.ZonedTime.TimeOfDay == new TimeSpan(0, 10, 20, 30, 400), "timetz reads back with its offset");
        }
    }

    static void Defaults(Func<EdgeContext> open)
    {
        using var context = open();
        var defaults = new Hekireki.Edge.Defaults();
        context.Add(defaults);
        context.SaveChanges();
        Check(defaults.Id != Guid.Empty, "dbgenerated(gen_random_uuid()) on a Guid key");
        Check(Regex.IsMatch(defaults.Code, "^[A-Za-z0-9_-]{21}$"), "nanoid() is 21 URL-safe characters");
        Check(Regex.IsMatch(defaults.Ref, "^c[a-z0-9]{24}$"), "cuid() on a non-key column");
        Check(defaults.Tag is not null && Regex.IsMatch(defaults.Tag, "^[0-9A-HJKMNP-TV-Z]{26}$"), "ulid() on an optional column");
        Check(Guid.Parse(defaults.Token).ToString()[14] == '4', "uuid(4)");
        Check(defaults.Auto > 0, "autoincrement() on a column that is not the key");
        Check(defaults.Trigger is null && Scalar(context, $"SELECT \"trigger\" FROM \"Defaults\" WHERE id = '{defaults.Id}'") is null, "dbgenerated() leaves the column to the database");

        // The columns Prisma gives no default must be named; every other one takes the database's.
        var dbDefault = Scalar(context, "INSERT INTO \"Defaults\" (code, ref, token) VALUES ('c', 'r', 't') RETURNING id")!;
        foreach (var column in new[] { "real", "small", "oid", "big", "float0", "whenZoned", "clock", "guid", "doc", "nickname", "count", "mood", "bitsDef" })
        {
            var ours = Text(context, $"SELECT \"{column}\"::text FROM \"Defaults\" WHERE id = '{defaults.Id}'");
            var theirs = Text(context, $"SELECT \"{column}\"::text FROM \"Defaults\" WHERE id = '{dbDefault}'");
            Check(ours == theirs, $"Defaults.{column}: {ours} is the database default {theirs}");
        }
        // A timestamp with an offset, in a column without a time zone: Prisma Client writes the
        // instant in UTC, while PostgreSQL reads the DEFAULT clause with the offset dropped. The
        // property follows Prisma Client; the column keeps Prisma Migrate's DEFAULT.
        Check(Text(context, $"SELECT \"when\"::text || ' ' || day::text || ' ' || stamps::text || ' ' || dates::text FROM \"Defaults\" WHERE id = '{defaults.Id}'")
            == "2020-01-01 03:34:56.123 2020-01-02 {\"2020-01-01 03:34:56.5\",\"2021-06-30 23:59:59\"} {2020-01-02}", "timestamp defaults are the UTC instant, as Prisma Client writes them");
        Check(Text(context, $"SELECT \"when\"::text || ' ' || day::text FROM \"Defaults\" WHERE id = '{dbDefault}'") == "2020-01-01 12:34:56.123 2020-01-01", "while the DEFAULT clause is Prisma Migrate's");
        Check(defaults.WhenZoned == new DateTime(2020, 1, 1, 3, 34, 56, 123, 456, DateTimeKind.Utc), "timestamptz: the same instant either way");

        var cleared = new Hekireki.Edge.Defaults { Nickname = null, Count = null, Mood = null, Tag = null };
        context.Add(cleared);
        context.SaveChanges();
        Check(Scalar(context, $"SELECT coalesce(nickname, count::text, mood::text, tag) FROM \"Defaults\" WHERE id = '{cleared.Id}'") is null, "an explicit null on a column with a default, generated or not, is stored as NULL");
    }
}
