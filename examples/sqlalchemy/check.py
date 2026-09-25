"""The generated models against the real SQLAlchemy, on the SQLite database `prisma db push` made
from schema.prisma. Nothing here creates a table: the metadata is first compared with the tables
Prisma wrote, then every column, key and relationship is used on them. Each check prints one
`ok:` line, or stops the run with what it saw instead."""

import sqlite3
import uuid
import warnings
from collections.abc import Callable
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, Enum, UniqueConstraint, create_engine, event, inspect, select, text
from sqlalchemy.exc import IntegrityError, SAWarning
from sqlalchemy.orm import Session, configure_mappers
from sqlalchemy.pool import ConnectionPoolEntry

from app.models import (
    Account,
    Base,
    Category,
    Order,
    OrderLine,
    Product,
    Profile,
    Search,
    Transfer,
    category_to_product,
    follows,
)

# A warning from the mapper is a relationship that overlaps another or a join it had to guess:
# something the generator got wrong, so it stops the run. The one exception is SQLite's own:
# it has no decimal type, and SQLAlchemy says so each time a Numeric column is used.
warnings.simplefilter("error", SAWarning)
warnings.filterwarnings("ignore", message=r"Dialect sqlite\+pysqlite does \*not\* support Decimal")

engine = create_engine(f"sqlite:///{Path(__file__).parent / 'dev.db'}")


# SQLite checks no foreign key until each connection asks it to: without this, every onDelete
# below would pass without the database doing anything.
@event.listens_for(Engine, "connect")
def enable_foreign_keys(connection: sqlite3.Connection, _record: ConnectionPoolEntry) -> None:
    connection.execute("PRAGMA foreign_keys=ON")


def check(name: str) -> Callable[[Callable[[], str | None]], None]:
    def run(body: Callable[[], str | None]) -> None:
        problem = body()
        if problem is not None:
            raise SystemExit(f"{name}: {problem}")
        print(f"ok: {name}")

    return run


def raw(sql: str, **params: Any) -> list[tuple[Any, ...]]:
    with engine.connect() as connection:
        return [tuple(row) for row in connection.execute(text(sql), params)]


def refused(work: Callable[[Session], None]) -> str | None:
    """None when the database refuses what `work` flushes; otherwise what went through."""
    with Session(engine) as session:
        try:
            work(session)
            session.flush()
        except IntegrityError:
            return None
        return "the database took it"


# The checks make rows; from empty tables each time, so the check can be run again. Account 1 is
# the house account a transfer falls back to when its receiver is deleted (onDelete: SetDefault).
with engine.begin() as connection:
    for table in reversed(Base.metadata.sorted_tables):
        connection.execute(table.delete())
    connection.execute(text("DELETE FROM sqlite_sequence"))
with Session(engine) as session:
    session.add(Account(id=1, email="house@example.com"))
    session.commit()


# --- The metadata is the database -----------------------------------------------------------


@check("the mappers configure without a warning")
def _() -> str | None:
    configure_mappers()
    return None


@check("every table Prisma made is mapped, and nothing else")
def _() -> str | None:
    in_database = set(inspect(engine).get_table_names()) - {"sqlite_sequence"}
    mapped = set(Base.metadata.tables)
    return None if in_database == mapped else f"database {sorted(in_database)}, metadata {sorted(mapped)}"


@check("columns, nullability and primary keys match the tables")
def _() -> str | None:
    inspector = inspect(engine)
    problems = []
    for name, table in Base.metadata.tables.items():
        columns = {c["name"]: c["nullable"] for c in inspector.get_columns(name)}
        mapped = {c.name: c.nullable for c in table.columns}
        if columns != mapped:
            problems.append(f"{name}: database {columns}, metadata {mapped}")
        key = set(inspector.get_pk_constraint(name)["constrained_columns"])
        mapped_key = {c.name for c in table.primary_key}
        # Prisma's join table on SQLite has no primary key, only a unique index on (A, B); the
        # metadata keys the pair, which is the same promise.
        if name.startswith("_"):
            key = {str(c) for i in inspector.get_indexes(name) if i["unique"] for c in i["column_names"]}
        if key != mapped_key:
            problems.append(f"{name} key: database {key}, metadata {mapped_key}")
    return "; ".join(problems) or None


@check("foreign keys match, with the actions Prisma wrote and the ones it implies")
def _() -> str | None:
    inspector = inspect(engine)
    problems = []
    for name, table in Base.metadata.tables.items():
        in_database = {
            (
                tuple(fk["constrained_columns"]),
                fk["referred_table"],
                tuple(fk["referred_columns"]),
                fk["options"].get("ondelete"),
                fk["options"].get("onupdate"),
            )
            for fk in inspector.get_foreign_keys(name)
        }
        mapped = {
            (
                tuple(c.name for c in fk.columns),
                fk.referred_table.name,
                tuple(e.column.name for e in fk.elements),
                # NO ACTION is what a foreign key does unless told otherwise, and SQLAlchemy's
                # reflection reports it as nothing.
                None if fk.ondelete == "NO ACTION" else fk.ondelete,
                None if fk.onupdate == "NO ACTION" else fk.onupdate,
            )
            for fk in table.foreign_key_constraints
        }
        if in_database != mapped:
            problems.append(f"{name}: database {sorted(in_database)}, metadata {sorted(mapped)}")
    return "; ".join(problems) or None


@check("unique columns, @@unique pairs and @@index names match")
def _() -> str | None:
    inspector = inspect(engine)
    problems = []
    for name, table in Base.metadata.tables.items():
        indexes = inspector.get_indexes(name)
        uniques = {frozenset(i["column_names"]) for i in indexes if i["unique"]}
        uniques |= {frozenset(u["column_names"]) for u in inspector.get_unique_constraints(name)}
        mapped_uniques = {frozenset([c.name]) for c in table.columns if c.unique}
        mapped_uniques |= {
            frozenset(c.name for c in u.columns)
            for u in table.constraints
            if isinstance(u, UniqueConstraint)
        }
        # The join table's unique pair is its primary key in the metadata (checked above).
        if not name.startswith("_") and uniques != mapped_uniques:
            problems.append(f"{name} unique: database {uniques}, metadata {mapped_uniques}")
        plain = {(i["name"], tuple(i["column_names"])) for i in indexes if not i["unique"]}
        mapped_plain = {(i.name, tuple(c.name for c in i.columns)) for i in table.indexes}
        if plain != mapped_plain:
            problems.append(f"{name} index: database {plain}, metadata {mapped_plain}")
    return "; ".join(problems) or None


# --- Columns ----------------------------------------------------------------------------------

RELEASED = datetime(2026, 4, 1, 9, 30, 15, 123456)


@check("every scalar type round-trips: Int, BigInt, Float, Decimal, Boolean, String, DateTime, Json, Bytes")
def _() -> str | None:
    with Session(engine) as session:
        product = Product(
            sku="LAMP-1",
            name="Lamp — 日本語 'quoted'",
            price=Decimal("19.99"),
            weight=1.25,
            stock=7,
            views=2**53 + 1,
            active=False,
            attributes={"colour": "red", "sizes": [1, 2.5, None], "nested": {"ok": True}},
            thumbnail=b"\x00\xffPNG\x00",
            released_at=RELEASED,
        )
        session.add(product)
        session.commit()
        key = product.id
    with Session(engine) as session:
        got = session.get(Product, key)
        if got is None:
            return "not found"
        seen = (got.name, got.price, got.weight, got.stock, got.views, got.active, got.attributes, got.thumbnail, got.released_at)
        expected = (
            "Lamp — 日本語 'quoted'",
            Decimal("19.99"),
            1.25,
            7,
            2**53 + 1,
            False,
            {"colour": "red", "sizes": [1, 2.5, None], "nested": {"ok": True}},
            b"\x00\xffPNG\x00",
            RELEASED,
        )
        if seen != expected:
            return f"expected {expected}, got {seen}"
        # What SQLite holds: an integer past 2^53 is still exact, the bytes are a BLOB.
        stored = raw("SELECT views, typeof(thumbnail) FROM products WHERE id = :id", id=key)
        return None if stored == [(2**53 + 1, "blob")] else f"stored {stored}"


@check("optional fields left out are None, and NULL in the table")
def _() -> str | None:
    with Session(engine) as session:
        product = Product(sku="BARE", name="Bare", price=Decimal(1), attributes={})
        account = Account(email="nulls@example.com")
        session.add_all([product, account])
        session.commit()
        seen = (product.weight, product.thumbnail, product.released_at, account.metadata_, account.class_, account.manager_id)
        if seen != (None,) * 6:
            return f"got {seen}"
        stored = raw("SELECT metadata IS NULL, class IS NULL FROM accounts WHERE id = :id", id=account.id)
        return None if stored == [(1, 1)] else f"stored {stored}"


@check("an optional Json set to None is SQL NULL, not the JSON text null")
def _() -> str | None:
    with Session(engine) as session:
        account = Account(email="json-null@example.com", metadata_={"theme": "dark"})
        session.add(account)
        session.commit()
        account.metadata_ = None
        session.commit()
        found = session.scalars(select(Account.email).where(Account.metadata_.is_(None), Account.id == account.id)).all()
        stored = raw("SELECT metadata FROM accounts WHERE id = :id", id=account.id)
        return None if stored == [(None,)] and found == ["json-null@example.com"] else f"stored {stored}, IS NULL found {found}"


@check("literal defaults are the model's, before and after the INSERT")
def _() -> str | None:
    with Session(engine) as session:
        account = Account(email="defaults@example.com")
        product = Product(sku="DEF", name="Defaults", price=Decimal(2), attributes={})
        session.add_all([account, product])
        session.flush()
        transfer = Transfer(amount=Decimal("5.00"), from_=account)
        session.add(transfer)
        session.commit()
        seen = (account.locale, account.role, product.stock, product.views, product.active, product.type, transfer.to_id)
        expected = ("en", "MEMBER", 0, 0, True, "physical", 1)
        return None if seen == expected else f"expected {expected}, got {seen}"


@check("now() is the database's default, @updatedAt is set on INSERT and bumped on UPDATE")
def _() -> str | None:
    with Session(engine) as session:
        account = Account(email="clock@example.com")
        session.add(account)
        session.commit()
        created, updated = account.created_at, account.updated_at
        if not (isinstance(created, datetime) and isinstance(updated, datetime)):
            return f"created_at {created!r}, updated_at {updated!r}"
        # CURRENT_TIMESTAMP counts whole seconds: the row is put back a day, so a bump shows.
        raw_update = "UPDATE accounts SET updated_at = '2000-01-01 00:00:00' WHERE id = :id"
        with engine.begin() as connection:
            connection.execute(text(raw_update), {"id": account.id})
        session.expire(account)
        account.email = "clock2@example.com"
        session.commit()
        if account.updated_at.year == 2000:
            return f"updated_at not bumped: {account.updated_at}"
        order = Order(account=account)
        session.add(order)
        session.commit()
        return None if isinstance(order.placed_at, datetime) else f"placed_at {order.placed_at!r}"


# --- Keys -------------------------------------------------------------------------------------


@check("autoincrement keys come from the database, one after another")
def _() -> str | None:
    with Session(engine) as session:
        first, second = Category(name="first"), Category(name="second")
        session.add_all([first, second])
        session.commit()
        return None if second.id == first.id + 1 else f"ids {first.id}, {second.id}"


@check("a uuid() key is made by the model, a version 4 UUID in a TEXT column")
def _() -> str | None:
    with Session(engine) as session:
        product = Product(sku="UUID", name="Keyed", price=Decimal(3), attributes={})
        session.add(product)
        session.flush()
        return None if uuid.UUID(product.id).version == 4 else f"id {product.id!r}"


@check("a cuid() key has no Python default: left out, the flush stops instead of writing NULL")
def _() -> str | None:
    with Session(engine) as session:
        owner = Account(email="cuid@example.com")
        session.add(owner)
        session.commit()
        owner_id = owner.id

    # SQLAlchemy stops it before the INSERT: a key with no default and no value (the warning is
    # an error in this run); without that, SQLite's NOT NULL would.
    with Session(engine) as session:
        session.add(Profile(account_id=owner_id))
        try:
            session.flush()
            return "a profile without an id was inserted"
        except SAWarning as warning:
            if "profiles.id" not in str(warning):
                return f"warned about something else: {warning}"
    with Session(engine) as session:
        session.add(Profile(id="profile-1", account_id=owner_id))
        session.commit()
        return None if session.get(Profile, "profile-1") else "profile with an id not found"


@check("a composite @@id finds one row, and refuses a second with the same pair")
def _() -> str | None:
    with Session(engine) as session:
        buyer = Account(email="composite@example.com")
        product = Product(sku="PAIR", name="Pair", price=Decimal(4), attributes={})
        order = Order(account=buyer)
        session.add_all([buyer, product, order])
        session.flush()
        session.add(OrderLine(order=order, product=product, unit_price=Decimal("4.50")))
        session.commit()
        pair = (order.id, product.id)
        line = session.get(OrderLine, pair)
        if line is None or line.quantity != 1 or line.unit_price != Decimal("4.50"):
            return f"got {line and (line.quantity, line.unit_price)}"
    return refused(lambda session: session.add(OrderLine(order_id=pair[0], product_id=pair[1], unit_price=Decimal(1))))


@check("@unique and @@unique refuse a duplicate; a NULL parent does not collide")
def _() -> str | None:
    with Session(engine) as session:
        owner = Account(email="unique@example.com")
        parent = Category(name="parent")
        session.add_all([owner, parent, Search(query="lamps", account=owner), Category(name="child", parent=parent)])
        # Two roots may share a name: NULL is distinct from NULL in a unique index.
        session.add_all([Category(name="root"), Category(name="root")])
        session.commit()
        owner_id, parent_id = owner.id, parent.id
    problems = [
        ("email", refused(lambda s: s.add(Account(email="unique@example.com")))),
        ("search", refused(lambda s: s.add(Search(query="lamps", account_id=owner_id)))),
        ("category", refused(lambda s: s.add(Category(name="child", parent_id=parent_id)))),
    ]
    return "; ".join(f"{what}: {problem}" for what, problem in problems if problem) or None


# --- Names ------------------------------------------------------------------------------------


@check("@map and @@map: attributes in Python's case over the columns and tables Prisma named")
def _() -> str | None:
    table = Account.__table__
    columns = (
        Account.created_at.property.columns[0].name,
        Account.metadata_.property.columns[0].name,
        Account.registry_.property.columns[0].name,
        Account.class_.property.columns[0].name,
        OrderLine.unit_price.property.columns[0].name,
    )
    expected = ("created_at", "metadata", "registry", "class", "unit_price")
    if columns != expected:
        return f"columns {columns}"
    # The attributes DeclarativeBase owns are still its own.
    if Account.metadata is not Base.metadata or not hasattr(Account.registry, "mappers"):
        return "metadata or registry shadowed"
    names = (table.name, Order.__table__.name, OrderLine.__table__.name)  # type: ignore[attr-defined]
    return None if names == ("accounts", "Order", "order_lines") else f"tables {names}"


@check("a table named after an SQL keyword is quoted in every statement")
def _() -> str | None:
    with Session(engine) as session:
        buyer = Account(email="keyword@example.com")
        session.add(Order(account=buyer, note="quoted"))
        session.commit()
        notes = session.scalars(select(Order.note).where(Order.account_id == buyer.id)).all()
        return None if notes == ["quoted"] else f"got {notes}"


@check("columns named query and type are plain columns")
def _() -> str | None:
    with Session(engine) as session:
        owner = Account(email="query@example.com")
        session.add_all([Search(query="desk", account=owner), Product(sku="T", name="T", price=Decimal(1), attributes={}, type="digital")])
        session.commit()
        queries = session.scalars(select(Search.query).where(Search.account_id == owner.id)).all()
        types = session.scalars(select(Product.type).where(Product.sku == "T")).all()
        return None if (queries, types) == (["desk"], ["digital"]) else f"got {queries}, {types}"


@check("enums store the @map'ed value, under the enum's own @@map")
def _() -> str | None:
    role, status = Account.__table__.c.role.type, Order.__table__.c.status.type
    if not (isinstance(role, Enum) and isinstance(status, Enum)):
        return f"role {role!r}, status {status!r}"
    if (role.enums, status.enums, status.name) != (["MEMBER", "admin", "owner"], ["pending", "paid", "cancelled"], "order_status"):
        return f"role {role.enums}, status {status.enums} named {status.name}"
    with Session(engine) as session:
        account = Account(email="enum@example.com", role="admin")
        order = Order(account=account)
        session.add_all([account, order])
        session.commit()
        stored = raw('SELECT a.role, o.status FROM accounts a JOIN "Order" o ON o.account_id = a.id WHERE a.id = :id', id=account.id)
        return None if stored == [("admin", "pending")] else f"stored {stored}"


# --- Relationships ----------------------------------------------------------------------------


@check("1-1: back_populates both ways, and a profile goes with its account")
def _() -> str | None:
    with Session(engine) as session:
        account = Account(email="one@example.com")
        profile = Profile(id="profile-2", bio="hi", avatar=b"\x89PNG")
        account.profile = profile
        session.add(account)
        session.commit()
        if profile.account is not account:
            return "profile.account is not the account"
        session.delete(account)
        session.commit()
        return None if session.get(Profile, "profile-2") is None else "profile survived its account"


@check("1-n: appending on one side sets the other, and the rows load both ways")
def _() -> str | None:
    with Session(engine) as session:
        account = Account(email="many@example.com")
        order = Order()
        account.orders.append(order)
        if order.account is not account:
            return "order.account not set by the append"
        session.add(account)
        session.commit()
        account_id = account.id
    with Session(engine) as session:
        loaded = session.get(Account, account_id)
        if loaded is None or [o.account_id for o in loaded.orders] != [account_id]:
            return "orders did not load"
        return None


@check("a self relation: manager and reports, and a manager's delete nulls the reports")
def _() -> str | None:
    with Session(engine) as session:
        boss = Account(email="boss@example.com")
        worker = Account(email="worker@example.com", manager=boss)
        session.add_all([boss, worker])
        session.commit()
        if boss.reports != [worker]:
            return f"reports {boss.reports}"
        session.delete(boss)
        session.commit()
        worker_id = worker.id
    stored = raw("SELECT manager_id FROM accounts WHERE id = :id", id=worker_id)
    return None if stored == [(None,)] else f"manager_id {stored}"


@check("an explicit many-to-many through OrderLine, from both ends")
def _() -> str | None:
    with Session(engine) as session:
        buyer = Account(email="lines@example.com")
        order = Order(account=buyer)
        pen, ink = (Product(sku=s, name=s, price=Decimal(1), attributes={}) for s in ("PEN", "INK"))
        order.lines = [OrderLine(product=pen, unit_price=Decimal(1), quantity=2), OrderLine(product=ink, unit_price=Decimal(2))]
        session.add(order)
        session.commit()
        codes = sorted(line.product.sku for line in order.lines)
        back = [line.order is order for line in pen.lines]
        return None if (codes, back) == (["INK", "PEN"], [True]) else f"codes {codes}, back {back}"


@check("an implicit many-to-many through Prisma's _CategoryToProduct, A the category, B the product")
def _() -> str | None:
    with Session(engine) as session:
        category = Category(name="lighting")
        product = Product(sku="M2M", name="M2M", price=Decimal(1), attributes={})
        product.categories.append(category)
        if category.products != [product]:
            return "category.products not set by the append"
        session.add(product)
        session.commit()
        rows = raw('SELECT "A", "B" FROM "_CategoryToProduct" WHERE "B" = :id', id=product.id)
        if rows != [(category.id, product.id)]:
            return f"join rows {rows}"
        session.delete(product)
        session.commit()
        left = raw('SELECT count(*) FROM "_CategoryToProduct" WHERE "A" = :id', id=category.id)
        return None if left == [(0,)] and category.products == [] else f"after delete {left}, {category.products}"


@check("a self many-to-many: following and followers are two ends, in the columns Prisma uses")
def _() -> str | None:
    with Session(engine) as session:
        ann, bob = Account(email="ann@example.com"), Account(email="bob@example.com")
        ann.following.append(bob)
        session.add_all([ann, bob])
        session.commit()
        if (bob.followers, bob.following, ann.followers) != ([ann], [], []):
            return f"bob.followers {bob.followers}, bob.following {bob.following}, ann.followers {ann.followers}"
        # What Prisma Client writes for `ann.following.connect(bob)`: A is bob, B is ann. The
        # field whose name sorts first (followers) lists the B of the rows whose A is the row.
        rows = raw('SELECT "A", "B" FROM "_Follows" WHERE "B" = :id', id=ann.id)
        return None if rows == [(bob.id, ann.id)] else f"join rows {rows}"


# --- onDelete ---------------------------------------------------------------------------------


@check("onDelete: Cascade, in the database and through the session")
def _() -> str | None:
    with Session(engine) as session:
        buyer = Account(email="cascade@example.com")
        product = Product(sku="CASCADE", name="Cascade", price=Decimal(1), attributes={})
        kept, gone = Order(account=buyer), Order(account=buyer)
        for order in (kept, gone):
            order.lines.append(OrderLine(product=product, unit_price=Decimal(1)))
        tree = Category(name="tree", children=[Category(name="leaf")])
        session.add_all([kept, gone, tree])
        session.commit()
        ids = (kept.id, gone.id, tree.id)
    # The session: lines it has loaded are deleted with the order, the rest by the database.
    with Session(engine) as session:
        loaded = session.get(Order, ids[1])
        session.delete(loaded)
        session.commit()
    # The database alone: a DELETE the ORM never sees.
    with engine.begin() as connection:
        connection.execute(text('DELETE FROM "Order" WHERE id = :id'), {"id": ids[0]})
        connection.execute(text("DELETE FROM categories WHERE id = :id"), {"id": ids[2]})
    lines = raw("SELECT count(*) FROM order_lines WHERE order_id IN (:a, :b)", a=ids[0], b=ids[1])
    leaves = raw("SELECT count(*) FROM categories WHERE parent_id = :id", id=ids[2])
    return None if lines == [(0,)] and leaves == [(0,)] else f"lines {lines}, leaves {leaves}"


@check("onDelete: Restrict refuses an account with orders and a product that was ordered")
def _() -> str | None:
    with Session(engine) as session:
        buyer = Account(email="restrict@example.com")
        product = Product(sku="RESTRICT", name="Restrict", price=Decimal(1), attributes={})
        session.add(OrderLine(order=Order(account=buyer), product=product, unit_price=Decimal(1)))
        session.commit()
        buyer_id, product_id = buyer.id, product.id

    # The children are loaded first, as they would be in an application: the session still leaves
    # them to the database rather than setting their key to NULL.
    def delete_buyer(session: Session) -> None:
        buyer = session.get(Account, buyer_id)
        _ = buyer and buyer.orders
        session.delete(buyer)

    def delete_product(session: Session) -> None:
        product = session.get(Product, product_id)
        _ = product and product.lines
        session.delete(product)

    problems = [("account", refused(delete_buyer)), ("product", refused(delete_product))]
    return "; ".join(f"{what}: {problem}" for what, problem in problems if problem) or None


@check("onDelete: SetNull nulls the reports of a manager deleted by the database")
def _() -> str | None:
    with Session(engine) as session:
        boss = Account(email="setnull@example.com")
        worker = Account(email="setnull-worker@example.com", manager=boss)
        session.add_all([boss, worker])
        session.commit()
        boss_id, worker_id = boss.id, worker.id
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM accounts WHERE id = :id"), {"id": boss_id})
    stored = raw("SELECT manager_id FROM accounts WHERE id = :id", id=worker_id)
    return None if stored == [(None,)] else f"manager_id {stored}"


@check("onDelete: NoAction refuses a sender; SetDefault hands a receiver's transfers to account 1")
def _() -> str | None:
    with Session(engine) as session:
        sender, receiver = Account(email="sender@example.com"), Account(email="receiver@example.com")
        transfer = Transfer(amount=Decimal("12.34"), from_=sender, to=receiver)
        session.add(transfer)
        session.commit()
        if (sender.sent, receiver.received) != ([transfer], [transfer]):
            return f"sent {sender.sent}, received {receiver.received}"
        sender_id, receiver_id, transfer_id = sender.id, receiver.id, transfer.id

    def delete_sender(session: Session) -> None:
        row = session.get(Account, sender_id)
        _ = row and row.sent
        session.delete(row)

    problem = refused(delete_sender)
    if problem is not None:
        return f"sender: {problem}"
    with Session(engine) as session:
        receiver_row = session.get(Account, receiver_id)
        _ = receiver_row and receiver_row.received
        session.delete(receiver_row)
        session.commit()
        moved = session.get(Transfer, transfer_id)
        return None if moved is not None and moved.to_id == 1 and moved.to.email == "house@example.com" else f"transfer {moved and moved.to_id}"
