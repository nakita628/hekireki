import org.jetbrains.exposed.v1.core.Table
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.SchemaUtils
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.migration.jdbc.MigrationUtils
import java.io.File
import java.sql.DriverManager
import kotlin.system.exitProcess
import org.jetbrains.exposed.v1.core.Schema as ExposedSchema

// gradle run --args="compare <schema> <ddl>"  the database SchemaUtils.create makes from the tables
//                                            against the one Prisma Migrate makes, catalog by catalog
// gradle run --args="migrate <schema> <ddl>"  what Exposed's MigrationUtils would change in Prisma's
// gradle run --args="smoke <schema> <ddl>"    reads and writes through the tables and entities on
//                                            Prisma's database
//
// <schema> is `main` (test/prisma/schema.prisma) or `edge` (test/prisma/exposed.prisma); <ddl> is
// `prisma migrate diff --from-empty --to-schema <file> --script`. The server is
// HEKIREKI_EXPOSED_PG, a JDBC URL whose path is left empty for the database.

val server: String = System.getenv("HEKIREKI_EXPOSED_PG") ?: "jdbc:postgresql://localhost:5432/?user=postgres&password=postgres"

fun database(name: String): String = server.replaceFirst(Regex("""/(\?|$)"""), "/$name$1")

class Schema(
    val name: String,
    val tables: List<Table>,
    val schemas: List<ExposedSchema>,
    val enumTypes: List<String>,
    // Catalog facts that differ, each documented, by the line they start with.
    val expected: List<String>,
    // What MigrationUtils asks for that is not a no-op on Prisma's database, each documented.
    val expectedMigration: List<Quirk>,
)

// A statement MigrationUtils asks for, and what running it on Prisma's database does to it.
class Quirk(
    statement: String,
    effect: String,
) {
    val statement = Regex(statement)
    val effect = Regex(effect)

    fun matches(
        statement: String,
        effect: String,
    ) = this.statement.matches(statement) && this.effect.matches(effect)

    override fun toString() = "$statement\n    $effect"
}

fun main(args: Array<String>) {
    if (args.size < 3) {
        System.err.println("usage: compare|migrate|smoke main|edge <ddl>")
        exitProcess(2)
    }
    val schema =
        when (args[1]) {
            "main" -> mainSchema()
            "edge" -> edgeSchema()
            else -> error("unknown schema ${args[1]}")
        }
    val ddl = File(args[2]).readText()
    val status =
        when (args[0]) {
            "compare" -> compare(schema, ddl)
            "migrate" -> migrate(schema, ddl)
            "smoke" -> if (schema.name == "main") Smoke.run(recreate("hekireki_exposed_main_smoke", ddl)) else EdgeSmoke.run(recreate("hekireki_exposed_edge_smoke", ddl))
            else -> error("unknown mode ${args[0]}")
        }
    exitProcess(status)
}

// A fresh database, with the citext extension (@db.Citext) in it; the script, when there is one,
// runs in it before it is handed back.
fun recreate(
    name: String,
    script: String?,
): String {
    DriverManager.getConnection(database("postgres")).use { admin ->
        admin.createStatement().use { it.execute("DROP DATABASE IF EXISTS \"$name\" WITH (FORCE)") }
        admin.createStatement().use { it.execute("CREATE DATABASE \"$name\"") }
    }
    DriverManager.getConnection(database(name)).use { connection ->
        connection.createStatement().use { it.execute("CREATE EXTENSION IF NOT EXISTS citext") }
        if (script != null) connection.createStatement().use { it.execute(script) }
    }
    return database(name)
}

fun compare(
    schema: Schema,
    ddl: String,
): Int {
    val prismaDatabase = recreate("hekireki_exposed_${schema.name}_prisma", ddl)
    val exposedDatabase = recreate("hekireki_exposed_${schema.name}_exposed", null)
    // Exposed creates neither schemas nor enum types; PrismaSchema lists what to create first.
    transaction(Database.connect(exposedDatabase)) {
        if (schema.schemas.isNotEmpty()) SchemaUtils.createSchema(*schema.schemas.toTypedArray())
        schema.enumTypes.forEach { exec(it) }
        SchemaUtils.create(*schema.tables.toTypedArray())
    }
    val prisma = Catalog.snapshot(prismaDatabase)
    val exposed = Catalog.snapshot(exposedDatabase)
    val differences = ((prisma - exposed).map { "- $it" } + (exposed - prisma).map { "+ $it" }).sorted()
    val unexpected = differences.filter { difference -> schema.expected.none { difference.startsWith(it) } }
    val unseen = schema.expected.filter { expected -> differences.none { it.startsWith(expected) } }
    unexpected.forEach { println(it) }
    unseen.forEach { println("expected, but the catalogs agree: $it") }
    println(
        "${schema.name}: ${prisma.size} catalog facts from Prisma, ${exposed.size} from Exposed, " +
            "${differences.size - unexpected.size} documented differences, ${unexpected.size} others",
    )
    return if (unexpected.isEmpty() && unseen.isEmpty()) 0 else 1
}

// Each statement MigrationUtils asks for is run on its own on a fresh copy of Prisma's database: one
// that leaves the catalog as it was is a difference in how Exposed compares, not in the schema.
fun migrate(
    schema: Schema,
    ddl: String,
): Int {
    val prismaDatabase = recreate("hekireki_exposed_${schema.name}_migrate", ddl)
    val statements =
        transaction(Database.connect(prismaDatabase)) {
            MigrationUtils.statementsRequiredForDatabaseMigration(*schema.tables.toTypedArray(), withLogs = false)
        }
    val before = Catalog.snapshot(prismaDatabase)
    val effects =
        statements.map { statement ->
            val scratch = recreate("hekireki_exposed_${schema.name}_scratch", ddl)
            val failure =
                runCatching { DriverManager.getConnection(scratch).use { c -> c.createStatement().use { it.execute(statement) } } }
                    .exceptionOrNull()
                    ?.message
                    ?.lineSequence()
                    ?.first()
            val after = if (failure == null) Catalog.snapshot(scratch) else before
            statement to
                when {
                    failure != null -> "fails: $failure"
                    after == before -> null
                    else -> "changes: " + ((before - after).map { "- $it" } + (after - before).map { "+ $it" }).sorted().joinToString("; ")
                }
        }
    val changing = effects.mapNotNull { (statement, effect) -> effect?.let { statement to it } }
    val unexpected = changing.filter { (statement, effect) -> schema.expectedMigration.none { it.matches(statement, effect) } }
    val unseen = schema.expectedMigration.filter { quirk -> changing.none { (statement, effect) -> quirk.matches(statement, effect) } }
    unexpected.forEach { (statement, effect) -> println("$statement\n    $effect") }
    unseen.forEach { println("expected, but not asked for: $it") }
    println(
        "${schema.name}: ${statements.size} statements from MigrationUtils, ${statements.size - changing.size} no-ops, " +
            "${changing.size - unexpected.size} documented, ${unexpected.size} others",
    )
    return if (unexpected.isEmpty() && unseen.isEmpty()) 0 else 1
}

fun mainSchema() =
    Schema(
        name = "main",
        tables = models.PrismaSchema.tables,
        schemas = models.PrismaSchema.schemas,
        enumTypes = models.PrismaSchema.enumTypes,
        // @ignore and @@ignore take a column and a table out of DMMF, not out of the database.
        expected =
            listOf(
                "- column public.Ghost.hidden ",
                "- column public.Phantom.id ",
                "- constraint public.Phantom.Phantom_pkey ",
                "- index public.Phantom.Phantom_pkey ",
                "- sequence public.Phantom_id_seq ",
            ),
        expectedMigration =
            listOf(
                // Exposed looks for the sequence of a serial column under the table's name unquoted,
                // which PostgreSQL folds to lower case: it misses "Category_id_seq" and asks for
                // category_id_seq, a second sequence nothing uses.
                Quirk(
                    """CREATE SEQUENCE IF NOT EXISTS [A-Z]\w*_id_seq START WITH 1 MINVALUE 1 MAXVALUE 9223372036854775807""",
                    """changes: \+ sequence public\.[a-z]\w*_id_seq bigint owned-by=none""",
                ),
                // Exposed reads a column named in capitals throughout back from the catalog folded to
                // lower case, and so misses the foreign key and the index on a join table's B column;
                // asking for them again fails, as they are there.
                Quirk(
                    """ALTER TABLE \S+ ADD CONSTRAINT "_\w+_B_fkey" FOREIGN KEY \("B"\) .*""",
                    """fails: ERROR: constraint "_\w+_B_fkey" for relation "_\w+" already exists""",
                ),
                Quirk("""CREATE INDEX "_\w+_B_index" ON \S+ \("B"\)""", """fails: ERROR: relation "_\w+_B_index" already exists"""),
                // @ignore takes a column out of DMMF, not out of the database.
                Quirk("""ALTER TABLE "Ghost" DROP COLUMN hidden""", """changes: - column public\.Ghost\.hidden .*"""),
            ),
    )

fun edgeSchema() =
    Schema(
        name = "edge",
        tables = hekireki.edge.PrismaSchema.tables,
        schemas = hekireki.edge.PrismaSchema.schemas,
        enumTypes = hekireki.edge.PrismaSchema.enumTypes,
        expected =
            listOf(
                // Exposed puts an autoincrement column first in a primary key.
                "- constraint public.Ledger.Ledger_pkey p PRIMARY KEY (book, seq)",
                "+ constraint public.Ledger.Ledger_pkey p PRIMARY KEY (seq, book)",
                "- index public.Ledger.Ledger_pkey ",
                "+ index public.Ledger.Ledger_pkey ",
                // Exposed cuts a name to 63 characters with its quotes: one that needs quoting and has
                // 62 or 63 characters of its own is written unquoted, and PostgreSQL lower-cases it.
                "- constraint public._AnExceedinglyLongModelNameThatKeepsGoingAndGoingToAnotherExcee._AnExceedinglyLong",
                "+ constraint public._AnExceedinglyLongModelNameThatKeepsGoingAndGoingToAnotherExcee._anexceedinglylong",
                "- index public._AnExceedinglyLongModelNameThatKeepsGoingAndGoingToAnotherExcee._AnExceedinglyLong",
                "+ index public._AnExceedinglyLongModelNameThatKeepsGoingAndGoingToAnotherExcee._anexceedinglylong",
                "- index public.AnExceedinglyLongModelNameThatKeepsGoingAndGoing.AnExceedinglyLong",
                "+ index public.AnExceedinglyLongModelNameThatKeepsGoingAndGoing.anexceedinglylong",
                // DMMF leaves an Unsupported field out, and with it the column and its index.
                "- column public.Doc.search ",
                "- index public.Doc.Doc_search_idx ",
            ),
        expectedMigration =
            listOf(
                // Exposed names the sequence of a serial column after the table's whole name, schema
                // and all, as one identifier: it never finds the one PostgreSQL made and asks for a
                // second in the default schema, one that, when the name is cut at 63 characters inside
                // a quote, does not even parse.
                Quirk(
                    """CREATE SEQUENCE IF NOT EXISTS "\w+\.[\w.]+_seq" START WITH 1 MINVALUE 1 MAXVALUE 9223372036854775807""",
                    """changes: \+ sequence public\.\w+\.[\w.]+_seq bigint owned-by=none""",
                ),
                Quirk(
                    """CREATE SEQUENCE IF NOT EXISTS ""public"\.\w+_seq START WITH 1 MINVALUE 1 MAXVALUE 9223372036854775807""",
                    """fails: Unterminated identifier .*""",
                ),
                // A table named in quotes with its schema (the only way to keep a schema and capitals
                // both) has no schema to Exposed, which then reads none of its unique constraints,
                // indexes and foreign keys, nor the foreign keys into it, from the catalog, and asks for
                // each again: each fails, as it is there.
                Quirk(
                    """ALTER TABLE "\w+"\."[\w.]+" ADD CONSTRAINT "[\w.]+" (UNIQUE|FOREIGN KEY) .*""",
                    """fails: ERROR: (relation|constraint) "[\w.]+" (for relation "[\w.]+" )?already exists""",
                ),
                Quirk(
                    """ALTER TABLE \S+ ADD CONSTRAINT "[\w-]+" FOREIGN KEY \("\w+"\) REFERENCES "\w+"\."\w+".*""",
                    """fails: ERROR: constraint "[\w-]+" for relation "[\w-]+" already exists""",
                ),
                Quirk(
                    """ALTER TABLE "\w+"\."\w+" ADD CONSTRAINT [a-z_]+ UNIQUE .*""",
                    """fails: ERROR: relation "[a-z_]+" already exists""",
                ),
                Quirk(
                    """CREATE (UNIQUE )?INDEX \S+ ON "\w+"\."\w+" .*""",
                    """fails: ERROR: relation "\w+" already exists""",
                ),
                // As in the main schema, the index on a join table's B column.
                Quirk("""CREATE INDEX "_[\w-]+_B_index" ON \S+ \("B"\)""", """fails: ERROR: relation "_[\w-]+_B_index" already exists"""),
                // With a name Exposed writes unquoted (see above), it finds no match in the catalog
                // either, and asks for the same index again under the name PostgreSQL folds it to.
                Quirk(
                    """ALTER TABLE \S+ ADD CONSTRAINT AnExceedinglyLong\w+ UNIQUE .*""",
                    """changes: \+ index public\.AnExceedinglyLong\w+\.anexceedinglylong\w+ CREATE UNIQUE INDEX .*""",
                ),
                Quirk(
                    """CREATE INDEX _AnExceedinglyLong\w+ ON \S+ \("B"\)""",
                    """changes: \+ index public\._AnExceedinglyLong\w+\._anexceedinglylong\w+ CREATE INDEX .*""",
                ),
            ),
    )
