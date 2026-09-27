"""The Django settings of the example: the app hekireki-django wrote, on dev.db or the database
DJANGO_DATABASE names (`postgresql://…` or `mysql://…`, as provider.ts passes it)."""

import os
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
URL = urlparse(os.environ.get("DJANGO_DATABASE", f"sqlite:///{HERE / 'dev.db'}"))

SECRET_KEY = "hekireki-example"
INSTALLED_APPS = ["app"]
DEFAULT_AUTO_FIELD = "django.db.models.AutoField"

# Django's default, and what the generated models are made for: an aware datetime in UTC in and
# out. TIME_ZONE is the zone a naive value is taken in and that times are shown in; it is not
# UTC here on purpose, so that nothing below holds only because the zone was UTC.
USE_TZ = True
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "Asia/Tokyo")

if URL.scheme == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": URL.path}}
else:
    if URL.scheme == "mysql":
        import pymysql

        # PyMySQL in place of mysqlclient, which needs a compiler and the MySQL headers. Django
        # asks the driver for mysqlclient's version, so PyMySQL answers with one it accepts.
        pymysql.version_info = (2, 2, 1, "final", 0)
        pymysql.install_as_MySQLdb()
    DATABASES = {
        "default": {
            "ENGINE": f"django.db.backends.{URL.scheme}",
            "NAME": URL.path.lstrip("/"),
            "USER": URL.username or "",
            "PASSWORD": URL.password or "",
            "HOST": URL.hostname or "",
            "PORT": str(URL.port or ""),
        }
    }
