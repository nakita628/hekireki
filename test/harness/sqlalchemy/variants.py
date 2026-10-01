"""Compiles the models test/lang/setup.ts writes for SQLite and MySQL into variants/: every table's
DDL in its own dialect, and on SQLite the tables made for real in a database in memory. A column type
the dialect cannot render, or a default or key it refuses, fails here.

Usage: python variants.py <sqlite|mysql>"""

import importlib.util
import sys
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.dialects import mysql, sqlite
from sqlalchemy.orm import configure_mappers
from sqlalchemy.schema import CreateIndex, CreateTable

provider = sys.argv[1]
spec = importlib.util.spec_from_file_location(
    f"models_{provider}", Path(__file__).parent / "variants" / provider / "models.py"
)
assert spec is not None and spec.loader is not None
models = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = models
spec.loader.exec_module(models)
configure_mappers()

dialect = sqlite.dialect() if provider == "sqlite" else mysql.dialect()
tables = models.Base.metadata.sorted_tables
for table in tables:
    str(CreateTable(table).compile(dialect=dialect))
    for index in table.indexes:
        str(CreateIndex(index).compile(dialect=dialect))

if provider == "sqlite":
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)

print(f"ok: {len(tables)} tables compile for {provider}")
