import java.sql.Connection
import java.sql.DriverManager

// What PostgreSQL's catalog says a database contains — columns (type, nullability, default),
// constraints, indexes, sequences and enum types — as one line per fact, so that two databases can
// be compared as sets.
object Catalog {
    private const val USER_SCHEMAS =
        "n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'"

    fun snapshot(url: String): Set<String> =
        DriverManager.getConnection(url).use { connection ->
            buildSet {
                query(
                    connection,
                    """
                    SELECT n.nspname, c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
                           pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated
                    FROM pg_attribute a
                    JOIN pg_class c ON c.oid = a.attrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                    WHERE c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND $USER_SCHEMAS
                    """,
                ).forEach { row ->
                    val type = row[3]!!
                    val value = row[5]?.let { defaultValue(connection, it, type) } ?: "none"
                    add(
                        "column ${row[0]}.${row[1]}.${row[2]} $type notnull=${row[4]} default=$value " +
                            "identity=${row[6]} generated=${row[7]}",
                    )
                }
                // A unique constraint is left to the index that backs it (listed below with the other
                // indexes): Exposed enforces a unique criterion with a constraint where Prisma creates
                // the index alone, and the two are the same index.
                query(
                    connection,
                    """
                    SELECT n.nspname, c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid)
                    FROM pg_constraint con
                    JOIN pg_class c ON c.oid = con.conrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE $USER_SCHEMAS AND con.contype <> 'u'
                    """,
                ).forEach { row -> add("constraint ${row[0]}.${row[1]}.${row[2]} ${row[3]} ${foreignKey(row[4]!!)}") }
                query(
                    connection,
                    """
                    SELECT n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid)
                    FROM pg_index x
                    JOIN pg_class i ON i.oid = x.indexrelid
                    JOIN pg_class c ON c.oid = x.indrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE $USER_SCHEMAS
                    """,
                ).forEach { row -> add("index ${row[0]}.${row[1]}.${row[2]} ${row[3]}") }
                query(
                    connection,
                    """
                    SELECT n.nspname, s.relname, format_type(q.seqtypid, NULL),
                           coalesce(t.relname || '.' || a.attname, 'none')
                    FROM pg_sequence q
                    JOIN pg_class s ON s.oid = q.seqrelid
                    JOIN pg_namespace n ON n.oid = s.relnamespace
                    LEFT JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass AND d.deptype = 'a'
                    LEFT JOIN pg_class t ON t.oid = d.refobjid
                    LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
                    WHERE $USER_SCHEMAS
                    """,
                ).forEach { row -> add("sequence ${row[0]}.${row[1]} ${row[2]} owned-by=${row[3]}") }
                query(
                    connection,
                    """
                    SELECT n.nspname, t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    GROUP BY n.nspname, t.typname
                    """,
                ).forEach { row -> add("enum ${row[0]}.${row[1]} (${row[2]})") }
            }
        }

    // The column pairs of a composite foreign key are sorted: the pairing is what the constraint
    // means, not the order it lists them in.
    private fun foreignKey(definition: String): String {
        val match = Regex("""^FOREIGN KEY \((.+?)\) REFERENCES (.+?)\((.+?)\)(.*)$""").find(definition) ?: return definition
        val pairs = match.groupValues[1].split(", ").zip(match.groupValues[3].split(", ")).sortedBy { it.first }
        return "FOREIGN KEY (${pairs.joinToString { it.first }}) REFERENCES ${match.groupValues[2]}" +
            "(${pairs.joinToString { it.second }})${match.groupValues[4]}"
    }

    // A constant default is compared by the value it gives in the column's type, so `0` and `0.0` on
    // a numeric column are one default; a default the database evaluates per row is compared as
    // written.
    private fun defaultValue(
        connection: Connection,
        expression: String,
        type: String,
    ): String {
        val isVolatile =
            Regex(
                """\b(nextval|now|random|gen_random_uuid|clock_timestamp|md5)\s*\(|CURRENT_(TIMESTAMP|DATE|TIME)|LOCALTIME""",
                RegexOption.IGNORE_CASE,
            ).containsMatchIn(expression)
        if (isVolatile) return "expr($expression)"
        return connection.createStatement().use { statement ->
            statement.executeQuery("SELECT (($expression)::$type)::text").use { rs ->
                rs.next()
                "value(${rs.getString(1)})"
            }
        }
    }

    private fun query(
        connection: Connection,
        sql: String,
    ): List<List<String?>> =
        connection.createStatement().use { statement ->
            statement.executeQuery(sql.trimIndent()).use { rs ->
                buildList {
                    while (rs.next()) add((1..rs.metaData.columnCount).map { rs.getString(it) })
                }
            }
        }
}
