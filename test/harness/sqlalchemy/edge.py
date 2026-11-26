"""Compiles the models test/prisma/sqlalchemy.prisma gives into edge/: a key on a prefix of a column
is written as Prisma Migrate writes it, for MySQL and for MariaDB, and a plain key elsewhere.

Usage: python edge.py"""

import importlib.util
import sys
from pathlib import Path

from sqlalchemy.dialects import mysql, sqlite
from sqlalchemy.dialects.mysql import mariadb
from sqlalchemy.schema import CreateTable

spec = importlib.util.spec_from_file_location("models_edge", Path(__file__).parent / "edge" / "models.py")
assert spec is not None and spec.loader is not None
models = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = models
spec.loader.exec_module(models)

tables = models.Base.metadata.tables
for dialect in (mysql.dialect(), mariadb.MariaDBDialect()):
    doc = str(CreateTable(tables["Doc"]).compile(dialect=dialect))
    assert "PRIMARY KEY (`key`(100))" in doc, doc
    pair = str(CreateTable(tables["Pair"]).compile(dialect=dialect))
    assert "PRIMARY KEY (a(50), b)" in pair, pair
    whole = str(CreateTable(tables["Whole"]).compile(dialect=dialect))
    assert "PRIMARY KEY (code)" in whole, whole
plain = str(CreateTable(tables["Pair"]).compile(dialect=sqlite.dialect()))
assert "PRIMARY KEY (a, b)" in plain, plain

print("ok: a key on a column prefix compiles as Prisma Migrate writes it")
