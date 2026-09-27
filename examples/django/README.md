# django

A small blog written by `hekireki-django` from `schema.prisma` and run against the real Django 5.2
ORM on SQLite, with Prisma Client on the same database. The schema is written as a Prisma schema
is written, with a corner of how Prisma keeps a `DateTime` in each model, and nothing here runs a
Django migration: the checks use the tables `prisma db push` made. mypy `--strict` with
django-stubs reads the generated module and the checks.

```bash
pnpm install
cd examples/django
pnpm run demo
```

`app/models.py` is committed as `prisma generate` writes it, so what the schema becomes can be read
here without running anything. `demo` starts from nothing all the same: `prisma generate` writes
`app/models.py` and the Prisma Client, `prisma db push` creates `dev.db`, `setup` makes a
virtualenv in `.venv` and installs the pinned `requirements.txt`, `typecheck` runs mypy with
`mypy.ini`, and `verify` runs `run.ts`: `check.py`, then `interop.ts` and `interop.py`, once with
the process and Django's `TIME_ZONE` in `Asia/Tokyo` and once in UTC. Each check prints one `ok:`
line and stops with what it saw otherwise. Python 3.10 or newer is needed for Django 5.2.

`pnpm run demo:postgresql` and `pnpm run demo:mysql` run the same on the databases of
`examples/compose.yaml`, or the one `DJANGO_DATABASE` names: `provider.ts` writes the schema again
under `.provider/<provider>/`, where each field with a `// postgresql:` or `// mysql:` comment takes
the native type it names (`@db.Timestamp(6)`, `@db.Timestamptz(3)`, `@db.Date`, `@db.Time(3)`,
`@db.Timetz(3)`, MySQL's `@db.DateTime(3)` and `@db.Timestamp(3)`) and PostgreSQL gets a
`DateTime[]`.

## Dates

Prisma Client keeps a `DateTime` as a UTC instant with milliseconds: a `timestamp(3)` without a
zone on PostgreSQL, a `DATETIME(3)` on MySQL, ISO 8601 text (`2030-01-02T03:04:05.678+00:00`) on
SQLite. Django's own `DateTimeField` would read such a column in the connection's zone and write
its own text on SQLite, so the models declare every column without a zone with `UtcDateTimeField`,
which `models.py` carries: it writes the UTC instant in Prisma's form and reads it back as UTC. A
`@db.Timestamptz` has a zone of its own and stays Django's field.

- `now()` is filled in by the model in UTC, as Prisma Client fills it, not by the database's
  clock; on a `@db.Date` or `@db.Time` it is today's UTC date or the UTC time.
- A literal default is the instant Prisma writes; on a `@db.Date` or `@db.Time` it is its UTC date
  or time, whatever `TIME_ZONE` is.
- `@updatedAt` is `auto_now`, and a model with one is managed by `AutoNowQuerySet`, so a
  `QuerySet.update()` bumps it as Prisma's `updateMany` does. On a `@db.Date` or `@db.Time` it is
  declared with `UtcDateField` or `UtcTimeField`, which stamp the UTC date or time of day where
  Django's own `auto_now` takes the local one.
- `settings.py` keeps `USE_TZ = True`, Django's default, with `TIME_ZONE` other than UTC. Under
  `USE_TZ = False` the models still store UTC and hand back naive values in `TIME_ZONE`, but Django
  sets a PostgreSQL session to `TIME_ZONE`, and a `dbgenerated()` default such as
  `CURRENT_TIMESTAMP` is then evaluated in that zone.

## What the checks ask

`check.py`, with Django alone:

- `now()` and `@updatedAt` are filled on create, aware and in UTC; `save()` and
  `QuerySet.update()` bump both `@updatedAt` of a post and leave `createdAt` alone; the literal
  `embargo` default is 2020-01-01 in UTC.
- An optional `publishedAt` written as a Tokyo wall clock is found by its UTC instant, sorts with
  the others, and is stored as Prisma stores it.
- A `Visit` is found by `get(pk=(path, at))`, a `DateTime` in a composite key.
- Every native type of `Clock` reads back as it was written: milliseconds, microseconds where the
  column keeps them, whole seconds, a date, a time, a `timetz`, a list.

`interop.ts`, with Prisma Client on what `check.py` left: each `DateTime` is the instant Django
wrote, `findUnique` by the composite key and `where` on each native type find Django's rows.
Then it writes an author, a post, a visit and a clock of its own, and `interop.py` reads them
through the models: the same instants, found by `get(pk=…)` and `filter`, sorted with Django's.
