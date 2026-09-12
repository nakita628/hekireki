using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using Npgsql;

// What PostgreSQL's catalog says a database contains — columns (type, nullability, default),
// constraints, indexes and enum types — as one line per fact, so that two databases can be
// compared as sets.
public static class Catalog
{
    const string UserSchemas =
        "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'";

    public static HashSet<string> Snapshot(string connectionString, IReadOnlySet<string> clientNoAction)
    {
        using var connection = new NpgsqlConnection(connectionString);
        connection.Open();
        var facts = new HashSet<string>();

        foreach (var row in Query(connection, $"""
            SELECT n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                   pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            WHERE c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND {UserSchemas}
            """))
        {
            var type = (string)row[3]!;
            var value = row[5] is string expression ? DefaultValue(connection, expression, type) : "none";
            facts.Add($"column {row[0]}.{row[1]}.{row[2]} {type} notnull={row[4]} default={value} identity={row[6]} generated={row[7]}");
        }

        // A unique constraint is left to the index that backs it (listed below with the other
        // indexes): EF Core enforces an alternate key with a constraint where Prisma creates the
        // index alone, and the two are the same index.
        foreach (var row in Query(connection, $"""
            SELECT n.nspname, c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid)
            FROM pg_constraint con
            JOIN pg_class c ON c.oid = con.conrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE {UserSchemas} AND con.contype <> 'u'
            """))
        {
            var name = (string)row[2]!;
            facts.Add($"constraint {row[0]}.{row[1]}.{name} {row[3]} {ForeignKey((string)row[4]!, clientNoAction.Contains(name))}");
        }

        foreach (var row in Query(connection, $"""
            SELECT n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid)
            FROM pg_index x
            JOIN pg_class i ON i.oid = x.indexrelid
            JOIN pg_class c ON c.oid = x.indrelid
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE {UserSchemas}
            """))
        {
            facts.Add($"index {row[0]}.{row[1]}.{row[2]} {row[3]}");
        }

        foreach (var row in Query(connection, """
            SELECT n.nspname, t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
            FROM pg_type t
            JOIN pg_enum e ON e.enumtypid = t.oid
            JOIN pg_namespace n ON n.oid = t.typnamespace
            GROUP BY n.nspname, t.typname
            """))
        {
            facts.Add($"enum {row[0]}.{row[1]} ({row[2]})");
        }

        return facts;
    }

    // EF Core has no ON UPDATE action, and a foreign key it leaves to the database (ClientNoAction)
    // is created without its ON DELETE; both are documented differences. The column pairs of a
    // composite key are sorted: EF Core lists them in the order of the key they reference, Prisma in
    // the order `fields` does, and the pairing is what the constraint means.
    static string ForeignKey(string definition, bool isClientNoAction)
    {
        var trimmed = Regex.Replace(definition, " ON UPDATE (CASCADE|RESTRICT|SET NULL|SET DEFAULT)", "");
        if (isClientNoAction) trimmed = Regex.Replace(trimmed, " ON DELETE (RESTRICT|SET DEFAULT|NO ACTION)", "");
        var match = Regex.Match(trimmed, @"^FOREIGN KEY \((.+?)\) REFERENCES (.+?)\((.+?)\)(.*)$");
        if (!match.Success) return trimmed;
        var pairs = match.Groups[1].Value.Split(", ")
            .Zip(match.Groups[3].Value.Split(", "), (from, to) => (from, to))
            .OrderBy(pair => pair.from, StringComparer.Ordinal)
            .ToList();
        return $"FOREIGN KEY ({string.Join(", ", pairs.Select(p => p.from))}) REFERENCES {match.Groups[2].Value}({string.Join(", ", pairs.Select(p => p.to))}){match.Groups[4].Value}";
    }

    // A constant default is compared by the value it gives in the column's type, so `0` and `0.0` on
    // a numeric column are one default; a default the database evaluates per row is compared as
    // written.
    static string DefaultValue(NpgsqlConnection connection, string expression, string type)
    {
        var isVolatile = Regex.IsMatch(
            expression,
            @"\b(nextval|now|random|gen_random_uuid|clock_timestamp|md5)\s*\(|CURRENT_(TIMESTAMP|DATE|TIME)|LOCALTIME",
            RegexOptions.IgnoreCase);
        if (isVolatile) return $"expr({expression})";
        using var command = new NpgsqlCommand($"SELECT (({expression})::{type})::text", connection);
        return $"value({command.ExecuteScalar()})";
    }

    static List<object?[]> Query(NpgsqlConnection connection, string sql)
    {
        using var command = new NpgsqlCommand(sql, connection);
        using var reader = command.ExecuteReader();
        var rows = new List<object?[]>();
        while (reader.Read())
        {
            var row = new object?[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++) row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            rows.Add(row);
        }
        return rows;
    }
}
