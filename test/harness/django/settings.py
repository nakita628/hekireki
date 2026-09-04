# Minimal settings: just enough for django.setup() to load the generated app.
# The PostgreSQL backend matches the datasource of test/prisma/schema.prisma (the
# harness never connects; DDL is compiled offline with collect_sql).
SECRET_KEY = "hekireki-django-harness"
INSTALLED_APPS = ["app"]
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "hekireki",
        "HOST": "localhost",
    }
}
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
