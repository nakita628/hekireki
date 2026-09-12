import models.AccountEntity
import models.AccountTable
import models.ActorEntity
import models.BadgeEntity
import models.BoardTable
import models.CategoryEntity
import models.CategoryTable
import models.ClaimEntity
import models.ClaimTable
import models.ComputedEntity
import models.CouponEntity
import models.EventEntity
import models.FilmEntity
import models.FollowEntity
import models.FollowTable
import models.GridCellEntity
import models.GridCellTable
import models.HandleEntity
import models.HandleTable
import models.InventoryTable
import models.KeywordEntity
import models.MachineWordEntity
import models.MarkEntity
import models.MonarchEntity
import models.NativeGridTable
import models.OrderLineItemEntity
import models.PostEntity
import models.ProfileEntity
import models.ProfileTable
import models.RefActionChildEntity
import models.RefActionChildTable
import models.RefActionParentEntity
import models.RefActionParentTable
import models.SequenceEntity
import models.Status
import models.StockTable
import models.TagEntity
import models.TicketEntity
import models.TortureEntity
import models.TortureTable
import models.Visibility
import models.WarehouseTable
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.CompositeID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.statements.StatementType
import org.jetbrains.exposed.v1.exceptions.ExposedSQLException
import org.jetbrains.exposed.v1.dao.flushCache
import org.jetbrains.exposed.v1.jdbc.Database
import org.jetbrains.exposed.v1.jdbc.JdbcTransaction
import org.jetbrains.exposed.v1.jdbc.SizedCollection
import org.jetbrains.exposed.v1.jdbc.deleteWhere
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.insertAndGetId
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

// Reads and writes a database Prisma Migrate created, through the generated tables and entities,
// and checks each row against what Prisma itself would have stored: the raw column values, read
// back with SQL, not what Exposed reads back from its own writes. The JVM runs in America/New_York
// (see build.gradle.kts), so a value converted through its time zone shows.
object Smoke {
    private var checks = 0

    fun check(
        condition: Boolean,
        what: String,
    ) {
        checks += 1
        if (!condition) throw IllegalStateException("check failed: $what")
    }

    inline fun <reified T : Throwable> throws(
        what: String,
        action: () -> Unit,
    ) {
        val thrown = runCatching(action).exceptionOrNull()
        check(thrown is T, "expected ${T::class.simpleName}, got $thrown: $what")
    }

    fun JdbcTransaction.scalar(sql: String): String? =
        exec(sql, explicitStatementType = StatementType.SELECT) { rs -> if (rs.next()) rs.getString(1) else null }

    fun run(url: String): Int {
        val db = Database.connect(url)
        transaction(db) { accounts() }
        transaction(db) { profiles() }
        transaction(db) { categories() }
        transaction(db) { manyToMany() }
        transaction(db) { generatedIds() }
        transaction(db) { defaults() }
        transaction(db) { nativeTypes() }
        transaction(db) { referentialActions() }
        transaction(db) { alternateAndCompositeKeys() }
        transaction(db) { monarchs() }
        transaction(db) { enumsAndLists() }
        transaction(db) { databaseDefaults() }
        println("ok: $checks checks against the Prisma-created database")
        return 0
    }

    private fun newAccount() =
        AccountEntity.new {
            bigNum = 9_007_199_254_740_993L
            price = BigDecimal("12345.678901234567890123456789")
            data = """{"k": "v"}"""
            raw = byteArrayOf(1, 2, 3)
            ratio = 0.5
            flag = true
            count = 7
        }

    private fun JdbcTransaction.accounts() {
        val account = newAccount()
        flushCache()
        val id = account.id.value
        check(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(id), "uuid() is a v4 UUID string")
        check(scalar("SELECT status::text FROM accounts WHERE id = '$id'") == "ACTIVE", "@default(ACTIVE) stores ACTIVE")
        check(scalar("SELECT tags IS NULL FROM accounts WHERE id = '$id'") == "t", "an unset scalar list stays NULL")
        check(
            scalar("SELECT abs(extract(epoch FROM created_at - (now() AT TIME ZONE 'UTC'))) < 60 FROM accounts WHERE id = '$id'") == "t",
            "now() is stored as the UTC clock, as Prisma stores it, whatever the JVM's zone",
        )
        check(account.createdAt.nano % 1_000_000 == 0 && account.createdAt <= Instant.now(), "now() is stamped in the client, to the millisecond")
        check(scalar("SELECT (extract(epoch FROM created_at) * 1000)::bigint FROM accounts WHERE id = '$id'") == account.createdAt.toEpochMilli().toString(), "the entity holds what was written")
        val read = AccountTable.selectAll().where { AccountTable.id eq id }.single()
        check(read[AccountTable.price].compareTo(BigDecimal("12345.678901234567890123456789")) == 0, "Decimal(65,30) reads back every digit")
        check(read[AccountTable.bigNum] == 9_007_199_254_740_993L, "BigInt past 2^53 round-trips")
        check(read[AccountTable.raw].contentEquals(byteArrayOf(1, 2, 3)), "Bytes round-trips")
        check(read[AccountTable.status] == Status.ACTIVE, "the enum reads back")
        AccountTable.update({ AccountTable.id eq id }) {
            it[status] = Status.PENDING_REVIEW
            it[tags] = listOf("x", "y")
        }
        check(scalar("SELECT status::text FROM accounts WHERE id = '$id'") == "PENDING_REVIEW", "an enum is written by its label")
        check(scalar("SELECT tags::text FROM accounts WHERE id = '$id'") == "{x,y}", "a scalar list is a text[]")
        check(AccountTable.selectAll().where { AccountTable.status eq Status.PENDING_REVIEW }.count() == 1L, "an enum is comparable in a query")
    }

    private fun JdbcTransaction.profiles() {
        val account = newAccount()
        val before = Instant.now().minusSeconds(1)
        val profile =
            ProfileEntity.new {
                this.account = account
                lastSeen = Instant.parse("2024-01-02T03:04:05Z")
            }
        check(profile.nickname == "anonymous" && profile.score == 0.0 && profile.balance.signum() == 0 && !profile.verified, "literal defaults are set on new entities")
        flushCache()
        val id = profile.id.value
        check(Regex("^c[a-z0-9]{24}$").matches(id), "cuid() is a 25-character CUID")
        check(profile.updatedAt >= before, "@updatedAt is stamped on insert")
        check(
            scalar("SELECT abs(extract(epoch FROM updated_at - (now() AT TIME ZONE 'UTC'))) < 60 FROM \"Profile\" WHERE id = '$id'") == "t",
            "@updatedAt is stored as the UTC clock",
        )
        check(scalar("SELECT nickname || ' ' || score || ' ' || balance || ' ' || verified FROM \"Profile\" WHERE id = '$id'") == "anonymous 0 0.00 false", "the defaults are written")
        check(scalar("SELECT (\"lastSeen\" AT TIME ZONE 'UTC')::text FROM \"Profile\" WHERE id = '$id'") == "2024-01-02 03:04:05", "timestamptz stores the instant")

        val first = profile.updatedAt
        Thread.sleep(20)
        profile.bio = "changed"
        flushCache()
        check(profile.updatedAt > first, "@updatedAt moves on update")
        check(scalar("SELECT (extract(epoch FROM updated_at) * 1000)::bigint FROM \"Profile\" WHERE id = '$id'") == profile.updatedAt.toEpochMilli().toString(), "and the new stamp is written")
        val pinned = Instant.parse("2000-01-01T00:00:00Z")
        profile.bio = "again"
        profile.updatedAt = pinned
        flushCache()
        check(scalar("SELECT updated_at::text FROM \"Profile\" WHERE id = '$id'") == "2000-01-01 00:00:00", "an @updatedAt the write sets is kept")

        check(account.profile?.id == profile.id, "one-to-one navigates from the principal")
        check(ProfileEntity[id].account.id == account.id, "and from the dependent")

        profile.nickname = "nick"
        flushCache()
        throws<ExposedSQLException>("@unique(accountId) holds") {
            ProfileTable.insert {
                it[accountId] = account.id
                it[nickname] = "other"
            }
        }
        rollback()
    }

    private fun JdbcTransaction.categories() {
        val parent = CategoryEntity.new { name = "root" }
        val child =
            CategoryEntity.new {
                name = "leaf"
                this.parent = parent
            }
        flushCache()
        check(parent.id.value > 0 && child.id.value > parent.id.value, "autoincrement ids come from the serial sequence")
        check(parent.children.single().id == child.id, "a self-relation lists its children")
        check(child.parent?.id == parent.id, "and follows its parent")
        CategoryTable.deleteWhere { CategoryTable.id eq parent.id }
        check(scalar("SELECT \"parentId\" IS NULL FROM \"Category\" WHERE id = ${child.id.value}") == "t", "onDelete SetNull (the default for an optional relation) nulls the child")
    }

    private fun JdbcTransaction.manyToMany() {
        val author = newAccount()
        val post =
            PostEntity.new {
                title = "t"
                this.author = author
            }
        val tag = TagEntity.new { label = "tag-${UUID.randomUUID()}" }
        flushCache()
        post.tags = SizedCollection(listOf(tag))
        flushCache()
        check(scalar("SELECT count(*) FROM \"_PostToTag\" WHERE \"A\" = '${post.id.value}' AND \"B\" = '${tag.id.value}'") == "1", "_PostToTag stores the post in A and the tag in B")
        check(tag.posts.single().id == post.id, "the other side of the join reads back")

        val actor = ActorEntity.new { }
        val film = FilmEntity.new { }
        flushCache()
        film.actors = SizedCollection(listOf(actor))
        flushCache()
        check(scalar("SELECT count(*) FROM _cast WHERE \"A\" = ${actor.id.value} AND \"B\" = ${film.id.value}") == "1", "a named relation uses _<name>, A for the model that sorts first")
        check(actor.films.single().id == film.id, "a named many-to-many reads from either side")

        exec("DELETE FROM \"Tag\" WHERE id = '${tag.id.value}'")
        check(scalar("SELECT count(*) FROM \"_PostToTag\" WHERE \"A\" = '${post.id.value}'") == "0", "join rows cascade with either side")

        val follower = newAccount()
        val followed = newAccount()
        flushCache()
        FollowEntity.new(
            CompositeID {
                it[FollowTable.followerId] = follower.id
                it[FollowTable.followingId] = followed.id
            },
        ) { }
        flushCache()
        check(followed.followers.single().follower.id == follower.id, "followers are the Follow rows pointing at the account")
        check(follower.following.single().following.id == followed.id, "following are the Follow rows the account made")
    }

    private fun JdbcTransaction.generatedIds() {
        val first =
            EventEntity.new {
                name = "a"
                happens = Instant.parse("2024-01-01T00:00:00Z")
            }
        Thread.sleep(2)
        val second =
            EventEntity.new {
                name = "b"
                happens = Instant.parse("2024-01-01T00:00:00Z")
            }
        flushCache()
        check(Regex("^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$").matches(first.id.value), "uuid(7) is a v7 UUID string")
        check(first.id.value < second.id.value, "v7 ids are ordered by creation")

        val ticket = TicketEntity.new { label = "t" }
        val coupon = CouponEntity.new { name = "c" }
        val badge = BadgeEntity.new { name = "b" }
        val explicit = TicketEntity.new("01ARZ3NDEKTSV4RRFFQ69G5FAV") { label = "mine" }
        val sequence = SequenceEntity.new { name = "s" }
        flushCache()
        check(Regex("^[0-9A-HJKMNP-TV-Z]{26}$").matches(ticket.id.value), "ulid() is a 26-character Crockford ULID")
        check(Regex("^[A-Za-z0-9_-]{10}$").matches(coupon.id.value), "nanoid(10) is 10 URL-safe characters")
        check(Regex("^[a-z][a-z0-9]{23}$").matches(badge.id.value), "cuid(2) is a 24-character CUID2")
        check(explicit.id.value == "01ARZ3NDEKTSV4RRFFQ69G5FAV", "an id the caller sets is kept")
        check(sequence.id.value > 0L, "BigInt autoincrement is bigserial")

        val keyword =
            KeywordEntity.new {
                type = "t"
                match = "m"
                async = "a"
                yield = "y"
                self = "s"
            }
        flushCache()
        check(scalar("SELECT \"self\" FROM \"Keyword\" WHERE id = '${keyword.id.value}'") == "s", "reserved-word columns keep their names")

        val word =
            MachineWordEntity.new {
                metadata = "m"
                registry = "r"
                tableName = "t"
            }
        flushCache()
        check(scalar("SELECT \"tableName\" FROM machine_words WHERE id = ${word.id.value}") == "t", "@@map tables and a column named like a member of Table")

        val item = OrderLineItemEntity.new { skuCode = "sku" }
        val zero =
            OrderLineItemEntity.new {
                skuCode = "zero"
                qty = 0
            }
        flushCache()
        check(scalar("SELECT qty FROM order_line_item WHERE id = ${item.id.value}") == "1", "@default(1) applies when unset")
        check(scalar("SELECT qty FROM order_line_item WHERE id = ${zero.id.value}") == "0", "an explicit 0 is stored, not replaced by the default")
    }

    private fun JdbcTransaction.defaults() {
        // Every literal default: the row Exposed writes for a new entity, and for a DSL insert, must
        // equal the row the database fills from its own DEFAULT clauses.
        val torture = TortureEntity.new { }
        flushCache()
        val dsl = TortureTable.insertAndGetId { }.value
        val dbDefault = scalar("INSERT INTO \"Torture\" DEFAULT VALUES RETURNING id")!!
        val columns = listOf("negInt", "negFloat", "bigPos", "bigNeg", "precise", "born", "jsonObj", "jsonArr", "jsonStr", "quoted", "unicode", "empty", "zero", "offFlag")
        columns.forEach { column ->
            val theirs = scalar("SELECT \"$column\"::text FROM \"Torture\" WHERE id = $dbDefault")
            check(scalar("SELECT \"$column\"::text FROM \"Torture\" WHERE id = ${torture.id.value}") == theirs, "Torture.$column (DAO) is the database default $theirs")
            check(scalar("SELECT \"$column\"::text FROM \"Torture\" WHERE id = $dsl") == theirs, "Torture.$column (DSL) is the database default $theirs")
        }
        check(torture.born == Instant.parse("2020-02-29T23:59:59.999Z") && torture.quoted == "it's a \"quote\" and a \\ backslash", "a new entity holds its defaults")

        val flipped =
            TortureEntity.new {
                negInt = 0
                offFlag = true
                zero = 5
                empty = "set"
                quoted = ""
            }
        flushCache()
        check(scalar("SELECT \"negInt\" || ' ' || \"offFlag\" || ' ' || zero || ' ' || empty || '|' || quoted || '|' FROM \"Torture\" WHERE id = ${flipped.id.value}") == "0 true 5 set||", "values that differ from the default are written")
    }

    private fun JdbcTransaction.nativeTypes() {
        val id =
            NativeGridTable.insertAndGetId {
                it[code] = "abc"
                it[label] = "label"
                it[tiny] = Short.MAX_VALUE
                it[ordinary] = Int.MIN_VALUE
                it[ident] = 4_294_967_295L
                it[single] = 1.5f
                it[double] = Math.PI
                it[wealth] = BigDecimal("-1234.56")
                it[exact] = BigDecimal("12345678901234.123456789012")
                it[blobby] = byteArrayOf(0, -1)
                it[doc] = """{"b": 1, "a": 2}"""
                it[plain] = """{"b":1,  "a":2}"""
                it[day] = LocalDate.parse("2024-02-29")
                it[clock] = LocalTime.parse("13:14:15.123")
                it[stamp] = Instant.parse("2024-01-01T12:00:00.400Z")
                it[zoned] = Instant.parse("2024-01-01T12:00:00.123456Z")
                it[address] = "10.1.0.0/16"
                it[mask] = "10101010"
                it[varMask] = "110"
                it[markup] = "<a>1</a>"
                it[bigCount] = Long.MAX_VALUE
                it[flagged] = true
            }.value
        check(id.version() == 4, "uuid() on @db.Uuid is a v4 UUID")
        check(scalar("SELECT address::text FROM \"NativeGrid\" WHERE id = '$id'") == "10.1.0.0/16", "inet keeps its netmask")
        check(scalar("SELECT stamp::text FROM \"NativeGrid\" WHERE id = '$id'") == "2024-01-01 12:00:00", "timestamp(0) rounds like PostgreSQL")
        check(scalar("SELECT (zoned AT TIME ZONE 'UTC')::text FROM \"NativeGrid\" WHERE id = '$id'") == "2024-01-01 12:00:00.123456", "timestamptz(6) keeps microseconds")
        check(scalar("SELECT plain::text FROM \"NativeGrid\" WHERE id = '$id'") == """{"b":1,  "a":2}""", "json keeps the text as written")
        check(scalar("SELECT mask::text || ' ' || \"varMask\"::text FROM \"NativeGrid\" WHERE id = '$id'") == "10101010 110", "bit(8) and varbit")
        check(scalar("SELECT wealth::numeric::text || ' ' || ident::text FROM \"NativeGrid\" WHERE id = '$id'") == "-1234.56 4294967295", "money and oid")
        check(scalar("SELECT day::text || ' ' || clock::text FROM \"NativeGrid\" WHERE id = '$id'") == "2024-02-29 13:14:15.123", "date and time(3)")
        val grid =
            NativeGridTable
                .selectAll()
                .where {
                    (NativeGridTable.id eq id) and (NativeGridTable.address eq "10.1.0.0/16") and
                        (NativeGridTable.wealth eq BigDecimal("-1234.56")) and (NativeGridTable.ident eq 4_294_967_295L) and
                        (NativeGridTable.mask eq "10101010")
                }.single()
        check(grid[NativeGridTable.code] == "abc" && grid[NativeGridTable.tiny] == Short.MAX_VALUE && grid[NativeGridTable.ordinary] == Int.MIN_VALUE, "char / smallint / integer")
        check(grid[NativeGridTable.exact].compareTo(BigDecimal("12345678901234.123456789012")) == 0, "decimal(38,12)")
        check(grid[NativeGridTable.wealth].compareTo(BigDecimal("-1234.56")) == 0 && grid[NativeGridTable.ident] == 4_294_967_295L, "money / oid read back")
        val formats = listOf("-$1,234.56", "1.234,56 €", "-1\u202f234,56 €", "￥1,235", "($5.00)", "$0.07", "12,5 Kč")
        check(
            formats.map(models.PgMoneyColumnType()::valueFromDB) == listOf("-1234.56", "1234.56", "-1234.56", "1235", "-5.00", "0.07", "12.5").map(::BigDecimal),
            "money in the formats lc_monetary writes, each read as its amount",
        )
        check(grid[NativeGridTable.blobby].contentEquals(byteArrayOf(0, -1)), "bytea")
        check(grid[NativeGridTable.day] == LocalDate.parse("2024-02-29") && grid[NativeGridTable.clock] == LocalTime.parse("13:14:15.123"), "date / time(3) read back")
        check(grid[NativeGridTable.stamp] == Instant.parse("2024-01-01T12:00:00Z") && grid[NativeGridTable.zoned] == Instant.parse("2024-01-01T12:00:00.123456Z"), "timestamp(0) / timestamptz(6) read back")
        check(grid[NativeGridTable.address] == "10.1.0.0/16" && grid[NativeGridTable.mask] == "10101010" && grid[NativeGridTable.varMask] == "110", "inet / bit / varbit read back")
        check(grid[NativeGridTable.markup] == "<a>1</a>" && grid[NativeGridTable.double] == Math.PI && grid[NativeGridTable.single] == 1.5f, "xml / double / real")
        check(grid[NativeGridTable.doc] == """{"a": 2, "b": 1}""" && grid[NativeGridTable.plain] == """{"b":1,  "a":2}""", "jsonb normalizes, json does not")
    }

    private fun JdbcTransaction.referentialActions() {
        // The database's SetDefault target: setDefaultId defaults to 1.
        exec("INSERT INTO \"RefActionParent\" (id) VALUES (1)")
        scalar("SELECT setval(pg_get_serial_sequence('\"RefActionParent\"', 'id'), 1)")
        val anchor = RefActionParentEntity[1]

        fun seed(): Pair<RefActionParentEntity, RefActionChildEntity> {
            val parent = RefActionParentEntity.new { }
            val child =
                RefActionChildEntity.new {
                    cascade = anchor
                    restrict = anchor
                    noAction = anchor
                }
            flushCache()
            return parent to child
        }

        seed().let { (parent, child) ->
            child.cascade = parent
            flushCache()
            RefActionParentTable.deleteWhere { RefActionParentTable.id eq parent.id }
            check(RefActionChildTable.selectAll().where { RefActionChildTable.id eq child.id }.empty(), "onDelete Cascade deletes in the database")
        }
        seed().let { (parent, child) ->
            child.setNull = parent
            flushCache()
            RefActionParentTable.deleteWhere { RefActionParentTable.id eq parent.id }
            check(scalar("SELECT \"setNullId\" IS NULL FROM \"RefActionChild\" WHERE id = ${child.id.value}") == "t", "onDelete SetNull nulls in the database")
        }
        seed().let { (parent, child) ->
            child.setDefault = parent
            flushCache()
            check(scalar("SELECT \"setDefaultId\" FROM \"RefActionChild\" WHERE id = ${child.id.value}") == parent.id.value.toString(), "the child points at the parent")
            RefActionParentTable.deleteWhere { RefActionParentTable.id eq parent.id }
            check(scalar("SELECT \"setDefaultId\" FROM \"RefActionChild\" WHERE id = ${child.id.value}") == "1", "onDelete SetDefault sets the default in the database")
        }
        val fresh = seed().second
        check(fresh.setDefaultId.value == 1, "an unset foreign key with a default takes it")
        commit()
        seed().let { (parent, child) ->
            child.restrict = parent
            flushCache()
            commit()
            throws<ExposedSQLException>("onDelete Restrict refuses in the database") {
                RefActionParentTable.deleteWhere { RefActionParentTable.id eq parent.id }
            }
            rollback()
        }
        seed().let { (parent, child) ->
            child.noAction = parent
            flushCache()
            commit()
            throws<ExposedSQLException>("onDelete NoAction refuses in the database") {
                RefActionParentTable.deleteWhere { RefActionParentTable.id eq parent.id }
            }
            rollback()
        }
    }

    private fun JdbcTransaction.alternateAndCompositeKeys() {
        val handle = HandleEntity.new { slug = "slug-${UUID.randomUUID()}" }
        val claim = ClaimEntity.new { this.handle = handle }
        flushCache()
        check(scalar("SELECT slug FROM \"Claim\" WHERE id = ${claim.id.value}") == handle.slug, "a foreign key to a unique non-id column stores that column")
        check(handle.claims.single().id == claim.id && claim.handle.id == handle.id, "and the DAO follows it both ways")

        val code = "W${UUID.randomUUID()}"
        WarehouseTable.insert {
            it[country] = "JP"
            it[this.code] = code
        }
        val stock =
            StockTable.insertAndGetId {
                it[country] = "JP"
                it[this.code] = code
                it[amount] = 3
            }
        check(scalar("SELECT country || '/' || code FROM \"Stock\" WHERE id = ${stock.value}") == "JP/$code", "a composite foreign key to @@unique stores both columns")

        GridCellTable.insert {
            it[x] = 1
            it[y] = 2
        }
        val cell =
            GridCellEntity[
                CompositeID {
                    it[GridCellTable.x] = 1
                    it[GridCellTable.y] = 2
                },
            ]
        val mark = MarkEntity.new { this.cell = cell }
        flushCache()
        check(scalar("SELECT x || ',' || y FROM \"Mark\" WHERE id = ${mark.id.value}") == "1,2", "a composite foreign key to @@id stores both columns")
        check(cell.marks.single().id == mark.id && mark.cell.id == cell.id, "and the DAO follows it both ways")

        HandleTable.deleteWhere { HandleTable.id eq handle.id }
        check(ClaimTable.selectAll().where { ClaimTable.slug eq handle.slug }.empty(), "onDelete Cascade on the slug relation")
    }

    private fun JdbcTransaction.monarchs() {
        val younger = MonarchEntity.new { name = "younger" }
        val elder =
            MonarchEntity.new {
                name = "elder"
                successor = younger
            }
        flushCache()
        check(younger.predecessor?.id == elder.id, "a one-to-one self-relation reads both ends")
        check(scalar("SELECT \"successorId\" FROM \"Monarch\" WHERE id = ${elder.id.value}") == younger.id.value.toString(), "successorId holds the successor")
    }

    private fun JdbcTransaction.enumsAndLists() {
        val board = BoardTable.insertAndGetId { it[audiences] = listOf(Visibility.PUBLIC, Visibility.LINK_ONLY) }.value
        check(scalar("SELECT visibility::text FROM \"Board\" WHERE id = $board") == "link_only", "a mapped enum default stores the @map value")
        check(scalar("SELECT audiences::text FROM \"Board\" WHERE id = $board") == "{public,link_only}", "an enum list is a visibility_level[]")
        val read = BoardTable.selectAll().where { (BoardTable.id eq board) and (BoardTable.visibility eq Visibility.LINK_ONLY) }.single()
        check(read[BoardTable.audiences] == listOf(Visibility.PUBLIC, Visibility.LINK_ONLY) && read[BoardTable.fallback] == null, "an enum list reads back")

        // 02:30 on 8 March 2020 does not exist in New York; a value converted through the JVM's zone
        // would come back an hour later.
        val gap = Instant.parse("2020-03-08T02:30:00Z")
        val inventory =
            InventoryTable.insertAndGetId {
                it[weights] = listOf(1.5)
                it[flags] = listOf(true, false)
                it[stamps] = listOf(gap, Instant.parse("2024-01-01T00:00:00.123Z"))
                it[bigs] = listOf(Long.MIN_VALUE)
                it[decs] = listOf(BigDecimal("0.000000000000000000000000000001"))
            }.value
        val dbDefault = scalar("INSERT INTO \"Inventory\" DEFAULT VALUES RETURNING id")!!
        listOf("tags", "codes", "labels").forEach { column ->
            check(scalar("SELECT $column::text FROM \"Inventory\" WHERE id = $inventory") == scalar("SELECT $column::text FROM \"Inventory\" WHERE id = $dbDefault"), "list default $column")
        }
        check(scalar("SELECT stamps::text FROM \"Inventory\" WHERE id = $inventory") == "{\"2020-03-08 02:30:00\",\"2024-01-01 00:00:00.123\"}", "timestamp(3)[] stores the UTC clock")
        check(scalar("SELECT trim_scale(decs[1])::text FROM \"Inventory\" WHERE id = $inventory") == "0.000000000000000000000000000001", "decimal(65,30)[] stores every digit")
        val lists = InventoryTable.selectAll().where { InventoryTable.id eq inventory }.single()
        check(lists[InventoryTable.stamps] == listOf(gap, Instant.parse("2024-01-01T00:00:00.123Z")), "timestamp(3)[] reads back, across a daylight-saving gap")
        check(lists[InventoryTable.codes] == listOf(1, 2, 3) && lists[InventoryTable.tags] == emptyList<String>(), "Int[] @default([1, 2, 3]) and String[] @default([])")
        check(lists[InventoryTable.flags] == listOf(true, false) && lists[InventoryTable.bigs] == listOf(Long.MIN_VALUE), "Boolean[] and BigInt[]")
    }

    private fun JdbcTransaction.databaseDefaults() {
        val computed = ComputedEntity.new { }
        flushCache()
        check(computed.id.value.version() == 4, "dbgenerated(gen_random_uuid()) comes back from the database")
        check(Regex("^[0-9a-f]{32}$").matches(computed.code), "dbgenerated(md5(...)) comes back from the database")
        check(computed.`when` > Instant.now(), "dbgenerated(now() + interval '1 day')")
    }
}
