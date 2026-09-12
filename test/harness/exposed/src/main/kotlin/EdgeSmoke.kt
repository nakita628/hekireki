import Smoke.check
import Smoke.scalar
import hekireki.edge.AnExceedinglyLongModelNameThatKeepsGoingAndGoingEntity
import hekireki.edge.AnotherExceedinglyLongModelNameThatKeepsGoingEntity
import hekireki.edge.BadgeEntity
import hekireki.edge.BareTable
import hekireki.edge.ChainedEntity
import hekireki.edge.ChickEntity
import hekireki.edge.ClashEntity
import hekireki.edge.ClashTable
import hekireki.edge.CodeEntity
import hekireki.edge.DefaultsEntity
import hekireki.edge.DefaultsTable
import hekireki.edge.DottedEntity
import hekireki.edge.EggEntity
import hekireki.edge.Größe
import hekireki.edge.HenEntity
import hekireki.edge.IndexedTable
import hekireki.edge.Instant
import hekireki.edge.KeylessEntity
import hekireki.edge.KeylessTable
import hekireki.edge.LedgerEntity
import hekireki.edge.LedgerTable
import hekireki.edge.Level
import hekireki.edge.LineTable
import hekireki.edge.List
import hekireki.edge.LowerEntity
import hekireki.edge.MemberEntity
import hekireki.edge.OrderEntity
import hekireki.edge.OwnerEntity
import hekireki.edge.PrimaryKey
import hekireki.edge.QuotedEntity
import hekireki.edge.QuotedTable
import hekireki.edge.ReferenceOption
import hekireki.edge.RoosterEntity
import hekireki.edge.Shade
import hekireki.edge.SharedEntity
import hekireki.edge.SluggedEntity
import hekireki.edge.SmallEntity
import hekireki.edge.TinyEntity
import hekireki.edge.TinyRefTable
import hekireki.edge.TinyTable
import hekireki.edge.TypedRefEntity
import hekireki.edge.WalletEntity
import hekireki.edge.WalletOwnerEntity
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.dao.flushCache
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.SizedCollection
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertAndGetId
import org.jetbrains.exposed.v1.jdbc.insertReturning
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import java.math.BigDecimal
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetTime
import java.time.ZoneOffset
import java.util.UUID
import java.time.Instant as JavaInstant

// The hazards of test/prisma/exposed.prisma, on the database Prisma Migrate creates from it: names
// that clash with the classes and members the generated code uses, identifiers Exposed would
// misread, keys and foreign keys of every shape, defaults that differ between Prisma Client and
// Prisma Migrate, and a list of every type.
object EdgeSmoke {
    fun run(url: String): Int {
        val db = Database.connect(url)
        // Egg before Hen: the two table objects initialize each other.
        transaction(db) { cycle() }
        transaction(db) { closedByTableForeignKey() }
        transaction(db) { clashes() }
        transaction(db) { members() }
        transaction(db) { quoted() }
        transaction(db) { keys() }
        transaction(db) { sharedColumns() }
        transaction(db) { lists() }
        transaction(db) { defaults() }
        transaction(db) { indexes() }
        transaction(db) { longNames() }
        transaction(db) { typedForeignKeys() }
        println("ok: edge checks against the Prisma-created database")
        return 0
    }

    private fun JdbcTransaction.cycle() {
        val egg = EggEntity.new { }
        val hen = HenEntity.new { this.egg = egg }
        flushCache()
        egg.hen = hen
        flushCache()
        check(hen.eggs.single().id == egg.id && egg.layer?.id == hen.id, "a cycle of foreign keys, each declared before its target")
    }

    // Rooster first: its reference initializes Chick, whose table-level foreign key reads the x and
    // y Rooster has declared by then.
    private fun JdbcTransaction.closedByTableForeignKey() {
        val rooster =
            RoosterEntity.new {
                x = 1
                y = 2
            }
        val chick =
            ChickEntity.new {
                rx = 1
                ry = 2
            }
        rooster.chick = chick
        flushCache()
        check(rooster.chick?.id == chick.id && chick.roosters.single().id == rooster.id, "a cycle closed by a table-level foreign key")
    }

    private fun JdbcTransaction.typedForeignKeys() {
        SmallEntity.new(1.toShort()) { }
        val code = CodeEntity.new("c") { name = "n" }
        val ref =
            TypedRefEntity.new {
                smallId = 1
                codeId = "c"
                codeName = "n"
            }
        flushCache()
        check(ref.named.id == code.id && code.byName.single().id == ref.id, "a foreign key to a unique column of another type, followed by the DAO")
        check(scalar("SELECT \"smallId\" || ' ' || \"codeId\" FROM \"TypedRef\" WHERE id = ${ref.id.value}") == "1 c", "and ones to keys of another type, held by plain columns")
    }

    private fun JdbcTransaction.clashes() {
        val parent =
            ClashEntity.new {
                instant = Instant.LATE
                kind = PrimaryKey.SURROGATE
            }
        val child =
            ClashEntity.new {
                instant = Instant.EARLY
                kind = PrimaryKey.NATURAL
                lists = listOf(List.TWO, List.ONE)
                shade = Shade.DARK
                this.parent = parent
            }
        flushCache()
        val row = scalar("SELECT list || ' ' || lists::text || ' ' || instant || ' ' || reference || ' ' || kind || ' ' || level || ' ' || shade FROM \"Clash\" WHERE id = ${child.id.value}")
        check(row == "ONE {TWO,ONE} EARLY ASK NATURAL foo-bar DARK", "enums named like List, Instant, ReferenceOption and PrimaryKey, in three schemas: $row")
        check(child.levels == listOf(Level.FOO_BAR, Level.FOO_BAR1, Level.IN, Level.FooBar), "an enum list default holds Prisma's constants")
        val dbDefault = scalar("INSERT INTO \"Clash\" (instant, kind) VALUES ('EARLY', 'NATURAL') RETURNING id")!!
        check(
            scalar("SELECT levels::text FROM \"Clash\" WHERE id = ${child.id.value}") == scalar("SELECT levels::text FROM \"Clash\" WHERE id = $dbDefault"),
            "and writes the labels the DEFAULT clause does",
        )
        check(scalar("SELECT levels::text FROM \"Clash\" WHERE id = $dbDefault") == "{FOO_BAR,foo-bar,in-out,\"say \\\"hi\\\"\"}", "labels in quotes")
        check(parent.children.single().id == child.id && child.stamp <= JavaInstant.now(), "a self-relation, and now() next to an enum named Instant")
        check(ClashTable.selectAll().where { ClashTable.level eq Level.FOO_BAR1 }.count() == 3L, "an enum in another schema compares by its label")
    }

    private fun JdbcTransaction.members() {
        val ann =
            MemberEntity.new {
                `when` = "w"
                `in` = 1
                `object` = true
                tableName = "t"
                columns = "c"
                primaryKey = "p"
                indices = "i"
                schemaName = "s"
                db1 = "d"
                klass1 = "k"
                writeValues1 = "wv"
                readValues1 = "rv"
                companion = "co"
                value = "v"
                handle = "ann"
            }
        val bob =
            MemberEntity.new {
                `when` = "w"
                `in` = 2
                `object` = false
                tableName = "t"
                columns = "c"
                primaryKey = "p"
                indices = "i"
                schemaName = "s"
                db1 = "d"
                klass1 = "k"
                writeValues1 = "wv"
                readValues1 = "rv"
                companion = "co"
                value = "v"
                handle = "none"
            }
        flushCache()
        check(ann.id.value.version() == 7, "uuid(7) on @db.Uuid is a v7 UUID")
        val row = scalar("SELECT \"when\" || \"in\" || \"object\" || \"tableName\" || columns || \"primaryKey\" || indices || \"schemaName\" || db || klass || \"writeValues\" || \"readValues\" || companion || value FROM audit.\"Member\" WHERE id = '${ann.id.value}'")
        check(row == "w1truetcpisdkwvrvcov", "keywords and names of Table, IdTable and Entity members reach their columns: $row")
        check(scalar("SELECT \"userId\" || ' ' || \"UserId\" || ' ' || sku_code || ' ' || \"URL\" || '|' || \"toString\" || '|' FROM audit.\"Member\" WHERE id = '${ann.id.value}'") == "0 1 x https://example.com/||", "userId and UserId, sku_code and URL")

        ann.friends = SizedCollection(listOf(bob))
        flushCache()
        // friendOf sorts before friends, so friendOf is the side that lists column B: ann.friends
        // holding bob is the row where bob's friendOf holds ann.
        check(scalar("SELECT count(*) FROM audit.\"_friends-of\" WHERE \"A\" = '${bob.id.value}' AND \"B\" = '${ann.id.value}'") == "1", "_friends-of stores the pair the way Prisma does")
        check(bob.friendOf.single().id == ann.id && ann.friendOf.empty() && bob.friends.empty(), "and the other side reads it back")

        val badge = BadgeEntity.new { member = ann }
        flushCache()
        check(scalar("SELECT \"memberHandle\" FROM \"Badge\" WHERE id = ${badge.id.value}") == "ann", "a one-to-one to a unique column stores that column")
        check(ann.badge?.id == badge.id && badge.member.id == ann.id, "and the DAO follows it both ways, across schemas")
        check(scalar("SELECT count(*) FROM pg_constraint WHERE conname = 'badge_member_fkey'") == "1", "@relation(map:) names the foreign key Prisma Migrate names")

        val chained = ChainedEntity.new { }
        flushCache()
        check(chained.code == "none" && chained.member?.id == bob.id, "a foreign key to a unique column, with a default and unique itself")
        check(bob.chained?.id == chained.id, "and the DAO follows it back")
    }

    private fun JdbcTransaction.quoted() {
        val quoted =
            QuotedEntity.new {
                upper = "u"
                dotted = "d"
                keyword = "k"
                kanji = "名"
                spaced = "s"
            }
        val lower = LowerEntity.new { this.quoted = quoted }
        flushCache()
        check(scalar("SELECT \"NAME\" || \"a.b\" || \"order\" || \"名前\" || \"First Name\" FROM audit.quoted WHERE id = ${quoted.id.value}") == "udk名s", "columns in capitals, with a dot, a keyword, Japanese and spaces")
        check(QuotedTable.selectAll().where { QuotedTable.upper eq "u" }.single()[QuotedTable.kanji] == "名", "and read back")
        check(quoted.lower.single().id == lower.id, "a table in a lower-case schema")
        check(quoted.größe == Größe.GROSS && quoted.maße == listOf(Größe.Ünï, Größe.KLEIN), "an enum, its values and fields named outside ASCII")
        check(scalar("SELECT \"größe\"::text || ' ' || \"maße\"::text FROM audit.quoted WHERE id = ${quoted.id.value}") == "groß {Ünï,KLEIN}", "stored under their labels")
        val dotted = DottedEntity.new { name = "x" }
        val order = OrderEntity.new { label = "o" }
        flushCache()
        check(scalar("SELECT name FROM \"Mixed\".\"dot.table\" WHERE id = ${dotted.id.value}") == "x" && scalar("SELECT label FROM \"Mixed\".\"order\" WHERE id = ${order.id.value}") == "o", "a dotted and a keyword table in a mixed-case schema")
        exec("DELETE FROM audit.quoted WHERE id = ${quoted.id.value}")
        check(scalar("SELECT count(*) FROM audit.lower_table WHERE id = ${lower.id.value}") == "0", "onDelete Cascade")
    }

    private fun JdbcTransaction.keys() {
        val ledger = LedgerEntity.new(CompositeID { it[LedgerTable.book] = "b" }) { }
        flushCache()
        val seq = ledger.id.value[LedgerTable.seq].value
        check(seq > 0 && ledger.book.value == "b" && ledger.total.signum() == 0, "a composite key with an autoincrement part comes back from the database")
        LineTable.insert {
            it[book] = "b"
            it[this.seq] = seq
            it[otherBook] = "b"
            it[otherSeq] = seq
        }
        LedgerTable.deleteWhere { LedgerTable.book eq "b" }
        check(scalar("SELECT count(*) FROM \"Line\"") == "0", "both composite foreign keys cascade")

        val keyless =
            KeylessEntity.new(
                CompositeID {
                    it[KeylessTable.region] = "eu"
                    it[KeylessTable.code] = "x"
                },
            ) { label = "l" }
        flushCache()
        check(KeylessEntity.find { KeylessTable.region eq "eu" }.single().label == "l" && keyless.code.value == "x", "a model keyed by a composite unique criterion")
        val slugged = SluggedEntity.new("s") { title = "t" }
        flushCache()
        check(SluggedEntity["s"].title == "t" && slugged.id.value == "s", "and one keyed by a unique column")

        val wallet = WalletEntity.new { }
        flushCache()
        check(wallet.id.value.startsWith("w-"), "a text key the database fills in comes back")
        val owner = WalletOwnerEntity.new(wallet.id.value) { name = "o" }
        flushCache()
        check(wallet.owner?.id == owner.id && owner.wallet.id == wallet.id, "a one-to-one that shares its key")

        val tiny = TinyTable.insertReturning(listOf(TinyTable.id)) { it[name] = "t" }.single()[TinyTable.id]
        TinyRefTable.insert { it[tinyId] = tiny.value }
        check(scalar("SELECT \"tinyId\" FROM \"TinyRef\"") == tiny.value.toString(), "a smallserial key filled by the database, referenced by a plain column")
        val explicit = TinyEntity.new(100.toShort()) { name = "explicit" }
        flushCache()
        check(explicit.id.value == 100.toShort() && scalar("SELECT name FROM \"Tiny\" WHERE id = 100") == "explicit", "and one the caller sets")
    }

    private fun JdbcTransaction.sharedColumns() {
        val owner = OwnerEntity.new { }
        val shared = SharedEntity.new { this.owner = owner }
        flushCache()
        check(owner.owned.single().id == shared.id, "the relation declared on the column")
        check(scalar("SELECT count(*) FROM pg_constraint WHERE conname IN ('shared_owner_fkey', 'Shared_alias_FK')") == "2", "both foreign keys, named with map")
    }

    private fun JdbcTransaction.lists() {
        // 02:30 on 8 March 2020 does not exist in New York; a value converted through the JVM's zone
        // would come back an hour later.
        val gap = JavaInstant.parse("2020-03-08T07:30:00.123456Z")
        val id =
            BareTable.insertAndGetId {
                it[varying] = "v"
                it[fixed] = "f"
                it[flag] = "1"
                it[bits] = "10101"
                it[exact] = BigDecimal("1.000000000000000000000000000000000000000001")
                it[stamp] = JavaInstant.parse("2020-03-08T02:30:00.123456Z")
                it[zoned] = gap
                it[clock] = LocalTime.parse("23:59:59.999999")
                it[zonedTime] = OffsetTime.parse("10:20:30.400+09:00")
                it[ci] = "MiXeD"
                it[names] = listOf("a,b", "c\"d")
                it[codes] = listOf("abc", "x")
                it[cis] = listOf("AbC")
                it[inets] = listOf("10.0.0.0/8", "::1")
                it[flags] = listOf("1010")
                it[varbits] = listOf("1", "10101")
                it[xmls] = listOf("<a/>")
                it[ids] = listOf(UUID.fromString("8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c"))
                it[smalls] = listOf(Short.MIN_VALUE)
                it[oids] = listOf(4_294_967_295L)
                it[reals] = listOf(1.5f)
                it[exacts] = listOf(BigDecimal("0.1"))
                it[moneys] = listOf(BigDecimal("-12.34"))
                it[docs] = listOf("""{"b": 1, "a": [2]}""")
                it[plains] = listOf("""{"b":1}""")
                it[blobs] = listOf(byteArrayOf(0, -1))
                it[stamps] = listOf(gap)
                it[days] = listOf(LocalDate.parse("2024-02-29"))
                it[clocks] = listOf(LocalTime.parse("13:14:15.123"))
                it[zones] = listOf(OffsetTime.parse("10:20:30.400+09:00"))
            }.value
        // A timestamptz is written in the session's zone, which the JDBC driver sets to the JVM's: New York.
        val raw = scalar("SELECT concat_ws(' | ', stamp, zoned AT TIME ZONE 'UTC', clock, \"zonedTime\", exact, flag, bits, names, codes, cis, inets, flags, varbits, xmls, ids, smalls, oids, reals, exacts, moneys::numeric[], docs, plains, blobs, stamps, days, clocks, zones) FROM \"Bare\" WHERE id = $id")
        val expected =
            "2020-03-08 02:30:00.123456 | 2020-03-08 07:30:00.123456 | 23:59:59.999999 | 10:20:30.4+09 | " +
                "1.000000000000000000000000000000000000000001 | 1 | 10101 | {\"a,b\",\"c\\\"d\"} | {abc,\"x  \"} | {AbC} | " +
                "{10.0.0.0/8,::1} | {1010} | {1,10101} | {<a/>} | {8f1d3b4a-2c6e-4f7a-9b0c-1d2e3f4a5b6c} | {-32768} | " +
                "{4294967295} | {1.5} | {0.1} | {-12.34} | {\"{\\\"a\\\": [2], \\\"b\\\": 1}\"} | {\"{\\\"b\\\":1}\"} | {\"\\\\x00ff\"} | " +
                "{\"2020-03-08 03:30:00.123456-04\"} | {2024-02-29} | {13:14:15.123} | {10:20:30.4+09}"
        check(raw == expected, "every type and a list of each, as PostgreSQL stores them:\n$raw\n$expected")
        val row = BareTable.selectAll().where { (BareTable.id eq id) and (BareTable.ci eq "mixed") }.single()
        check(row[BareTable.stamp] == JavaInstant.parse("2020-03-08T02:30:00.123456Z") && row[BareTable.zoned] == gap, "timestamp and timestamptz read back")
        check(row[BareTable.stamps] == listOf(gap) && row[BareTable.days] == listOf(LocalDate.parse("2024-02-29")), "timestamptz[] and date[] read back")
        check(row[BareTable.clocks] == listOf(LocalTime.parse("13:14:15.123")) && row[BareTable.zones] == listOf(OffsetTime.parse("10:20:30.400+09:00")), "time[] and timetz[] read back")
        check(row[BareTable.moneys]!!.single().compareTo(BigDecimal("-12.34")) == 0 && row[BareTable.oids] == listOf(4_294_967_295L), "money[] and oid[] read back")
        check(row[BareTable.inets] == listOf("10.0.0.0/8", "::1") && row[BareTable.flags] == listOf("1010") && row[BareTable.varbits] == listOf("1", "10101"), "inet[], bit[] and varbit[] read back")
        check(row[BareTable.docs] == listOf("""{"a": [2], "b": 1}""") && row[BareTable.plains] == listOf("""{"b":1}""") && row[BareTable.cis] == listOf("AbC"), "jsonb[], json[] and citext[] read back")
        check(row[BareTable.blobs]!!.single().contentEquals(byteArrayOf(0, -1)) && row[BareTable.codes] == listOf("abc", "x  "), "bytea[] and char(3)[] read back")
        check(row[BareTable.flag] == "1" && row[BareTable.exact].compareTo(BigDecimal("1.000000000000000000000000000000000000000001")) == 0, "bit(1) and numeric read back")
    }

    private fun JdbcTransaction.defaults() {
        val entity = DefaultsEntity.new { }
        flushCache()
        val dsl = DefaultsTable.insertAndGetId { }.value
        val dbDefault = scalar("INSERT INTO \"Defaults\" (code, ref, ref2, token, plain, \"touchedOn\") VALUES ('c', 'r', 'r2', 't', gen_random_uuid(), CURRENT_DATE) RETURNING id")!!
        listOf("real", "small", "oid", "big", "minBig", "minInt", "minSmall", "tiny", "float0", "whenZoned", "clock", "zonedTime", "guid", "doc", "text", "quoted", "exact", "labels", "words", "bytes", "price", "address", "mask", "bitsDef", "markup", "nickname", "count", "mood")
            .forEach { column ->
                val theirs = scalar("SELECT \"$column\"::text FROM \"Defaults\" WHERE id = '$dbDefault'")
                check(scalar("SELECT \"$column\"::text FROM \"Defaults\" WHERE id = '${entity.id.value}'") == theirs, "Defaults.$column (DAO) is the database default $theirs")
                check(scalar("SELECT \"$column\"::text FROM \"Defaults\" WHERE id = '$dsl'") == theirs, "Defaults.$column (DSL) is the database default $theirs")
            }
        check(entity.text == "line one\nline two\r\n\$dollar \"quoted\" \\ back", "a string default with line breaks")
        val instants = "SELECT \"when\"::text || ' ' || day::text || ' ' || stamps::text || ' ' || dates::text FROM \"Defaults\" WHERE id = "
        check(scalar(instants + "'${entity.id.value}'") == "2020-01-01 03:34:56.123 2020-01-02 {\"2020-01-01 03:34:56.5\",\"2021-06-30 23:59:59\"} {2020-01-02}", "timestamp defaults are the UTC instant, as Prisma Client writes them")
        check(scalar(instants + "'$dbDefault'") == "2020-01-01 12:34:56.123 2020-01-01 {\"2020-01-01 12:34:56.5\",\"2021-06-30 23:59:59\"} {2020-01-01}", "while the DEFAULT clause is Prisma Migrate's")
        check(entity.whenZoned == JavaInstant.parse("2020-01-01T03:34:56.123456Z"), "timestamptz: the same instant either way")
        check(Regex("^[A-Za-z0-9_-]{8}$").matches(entity.code) && Regex("^c[a-z0-9]{24}$").matches(entity.ref) && Regex("^[a-z][a-z0-9]{23}$").matches(entity.ref2), "nanoid(8), cuid() and cuid(2)")
        check(Regex("^[0-9A-HJKMNP-TV-Z]{26}$").matches(entity.tag!!) && UUID.fromString(entity.token).version() == 4 && entity.plain.version() == 7, "ulid(), uuid(4) and uuid(7) on @db.Uuid")
        check(entity.auto > 0 && entity.trigger == null, "an autoincrement column that is not the key, and a dbgenerated() one the database leaves NULL")
        val utc = scalar("SELECT \"dayNow\" = (now() AT TIME ZONE 'UTC')::date AND abs(extract(epoch FROM \"clockNow\" - (now() AT TIME ZONE 'UTC')::time)) < 60 FROM \"Defaults\" WHERE id = '${entity.id.value}'")
        check(utc == "t" && entity.zonedNow.offset == ZoneOffset.UTC, "now() in a date, time and timetz column is the UTC date and time of day")
        check(entity.touchedOn == LocalDate.now(ZoneOffset.UTC) && entity.touched != null, "@updatedAt on insert, in a date and an optional timestamptz column")
        val first = entity.touched!!
        Thread.sleep(20)
        entity.nickname = null
        entity.count = null
        entity.mood = null
        entity.tag = null
        flushCache()
        check(entity.touched!! > first, "@updatedAt moves on update")
        check(scalar("SELECT coalesce(nickname, count::text, mood::text, tag) FROM \"Defaults\" WHERE id = '${entity.id.value}'") == null, "an explicit null on a column with a default, generated or not, is stored as NULL")
    }

    private fun JdbcTransaction.indexes() {
        IndexedTable.insert {
            it[doc] = "{}"
            it[tags] = listOf("a")
            it[addr] = "10.0.0.1"
            it[name] = "n"
            it[n] = 1
            it[u] = UUID.randomUUID()
        }
        commit()
        Smoke.throws<ExposedSQLException>("@@unique([name(sort: Desc), n]) holds") {
            IndexedTable.insert {
                it[doc] = "{}"
                it[tags] = listOf("b")
                it[addr] = "10.0.0.2"
                it[name] = "n"
                it[n] = 1
                it[u] = UUID.randomUUID()
            }
        }
        rollback()
    }

    private fun JdbcTransaction.longNames() {
        val long = AnExceedinglyLongModelNameThatKeepsGoingAndGoingEntity.new { anExceedinglyLongColumnNameThatAlsoKeepsGoing = 1 }
        val another = AnotherExceedinglyLongModelNameThatKeepsGoingEntity.new { }
        flushCache()
        long.others = SizedCollection(listOf(another))
        flushCache()
        check(another.longs.single().id == long.id, "a join table whose name Prisma cuts to 63 characters")
    }
}
