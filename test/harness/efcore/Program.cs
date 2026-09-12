using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;

// dotnet run -- script <schema>            the CREATE script EF Core derives from the model
// dotnet run -- compare <schema> <ddl>     that script against Prisma Migrate's, catalog by catalog
// dotnet run -- smoke <schema> <ddl>       reads and writes through the model on Prisma's schema
//
// <schema> is `main` (test/prisma/schema.prisma) or `edge` (test/prisma/efcore.prisma); <ddl> is
// `prisma migrate diff --from-empty --to-schema <file> --script`. The server is
// HEKIREKI_EFCORE_PG, a connection string without a database.

var server = Environment.GetEnvironmentVariable("HEKIREKI_EFCORE_PG")
    ?? "Host=localhost;Username=postgres;Password=postgres";

if (args.Length < 2)
{
    Console.Error.WriteLine("usage: script|compare|smoke main|edge [ddl]");
    return 2;
}

var schema = args[1] switch
{
    "main" => new Schema(
        "main",
        connection => new Models.AppDbContext(Options<Models.AppDbContext>(connection, Models.AppDbContext.MapEnums)),
        // @ignore and @@ignore take a column and a table out of DMMF, not out of the database.
        [
            "- column public.Ghost.hidden ",
            "- column public.Phantom.id ",
            "- constraint public.Phantom.Phantom_pkey ",
            "- index public.Phantom.Phantom_pkey ",
        ]),
    "edge" => new Schema(
        "edge",
        connection => new Hekireki.Edge.EdgeContext(Options<Hekireki.Edge.EdgeContext>(connection, Hekireki.Edge.EdgeContext.MapEnums)),
        // A model without @id is keyed by its first unique criterion, which EF Core can only make a
        // primary key; Prisma leaves the table without one. The index is the same either way.
        ["+ constraint public.Keyless.keyless_code_key p "]),
    _ => throw new ArgumentException($"unknown schema {args[1]}"),
};

switch (args[0])
{
    case "script":
        using (var context = schema.Open("Host=localhost;Database=unused"))
        {
            Console.WriteLine(context.Database.GenerateCreateScript());
        }
        return 0;
    case "compare":
        return Compare(File.ReadAllText(args[2]));
    case "smoke":
        var database = Recreate($"hekireki_efcore_{schema.Name}_smoke", File.ReadAllText(args[2]));
        return schema.Name == "main"
            ? Smoke.Run(Options<Models.AppDbContext>(database, Models.AppDbContext.MapEnums))
            : EdgeSmoke.Run(() => new Hekireki.Edge.EdgeContext(Options<Hekireki.Edge.EdgeContext>(database, Hekireki.Edge.EdgeContext.MapEnums)));
    default:
        Console.Error.WriteLine($"unknown mode {args[0]}");
        return 2;
}

// Configured as the README tells users to: the context's MapEnums handed to UseNpgsql.
DbContextOptions<T> Options<T>(string connectionString, Action<NpgsqlDbContextOptionsBuilder> mapEnums) where T : DbContext =>
    new DbContextOptionsBuilder<T>().UseNpgsql(connectionString, mapEnums).Options;

string Database(string name) => new NpgsqlConnectionStringBuilder(server) { Database = name }.ConnectionString;

// A fresh database; the script, when there is one, runs in it before it is handed back.
string Recreate(string name, string? script = null)
{
    using (var admin = new NpgsqlConnection(Database("postgres")))
    {
        admin.Open();
        using var drop = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)", admin);
        drop.ExecuteNonQuery();
        using var create = new NpgsqlCommand($"CREATE DATABASE \"{name}\"", admin);
        create.ExecuteNonQuery();
    }
    if (script is not null)
    {
        using var connection = new NpgsqlConnection(Database(name));
        connection.Open();
        using var command = new NpgsqlCommand(script, connection);
        command.ExecuteNonQuery();
    }
    return Database(name);
}

int Compare(string prismaDdl)
{
    var prismaDatabase = Recreate($"hekireki_efcore_{schema.Name}_prisma", prismaDdl);
    var efDatabase = Recreate($"hekireki_efcore_{schema.Name}_ef");
    using (var context = schema.Open(efDatabase))
    {
        context.Database.EnsureCreated();
    }

    using var model = schema.Open("Host=localhost;Database=unused");
    var clientNoAction = model.Model.GetEntityTypes()
        .SelectMany(e => e.GetForeignKeys())
        .Where(fk => fk.DeleteBehavior == DeleteBehavior.ClientNoAction)
        .Select(fk => fk.GetConstraintName() ?? "")
        .ToHashSet();

    var prisma = Catalog.Snapshot(prismaDatabase, clientNoAction);
    var ef = Catalog.Snapshot(efDatabase, clientNoAction);
    var differences = prisma.Except(ef).Select(fact => $"- {fact}")
        .Concat(ef.Except(prisma).Select(fact => $"+ {fact}"))
        .Order(StringComparer.Ordinal)
        .ToList();
    var unexpected = differences.Where(d => !schema.Expected.Any(d.StartsWith)).ToList();
    var unseen = schema.Expected.Where(e => !differences.Any(d => d.StartsWith(e))).ToList();

    foreach (var difference in unexpected) Console.WriteLine(difference);
    foreach (var expected in unseen) Console.WriteLine($"expected, but the catalogs agree: {expected}");
    Console.WriteLine($"{schema.Name}: {prisma.Count} catalog facts from Prisma, {ef.Count} from EF Core, {differences.Count - unexpected.Count} documented differences, {unexpected.Count} others");
    return unexpected.Count == 0 && unseen.Count == 0 ? 0 : 1;
}

record Schema(string Name, Func<string, DbContext> Open, IReadOnlyList<string> Expected);
