<h1 id="hekireki-studio-api">Hekireki Studio API v1.0.0</h1>

> Scroll down for code samples, example requests and responses. Select a language for code samples from the tabs above or the mobile navigation menu.

Local API behind `hekireki studio`: the parsed Prisma schema, the schema file on disk,
the connected database and the Prisma language server. It listens on loopback only and
has no authentication, so nothing here is reachable from another origin.

<h1 id="hekireki-studio-api-schema">schema</h1>

## readSchema

<a id="opIdreadSchema"></a>

> Code samples

```bash
curl http://localhost:5555/schema \
  -H 'Accept: application/json'
```

`GET /schema`

The current snapshot: the last valid schema, the current Prisma error and the files on disk.

> Example responses

> 200 Response

```json
{
  "schema": null,
  "error": "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "diagnostics": [
    {
      "path": "prisma/schema.prisma",
      "range": {
        "start": {
          "line": 1,
          "character": 5
        },
        "end": {
          "line": 1,
          "character": 9
        }
      },
      "message": "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
      "severity": "error"
    }
  ],
  "updatedAt": "2026-09-02T00:00:00.000Z",
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "model User {\n  id Nope @id\n}\n"
    }
  ]
}
```

<h3 id="readschema-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Snapshot](#schemasnapshot)|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## reloadSchema

<a id="opIdreloadSchema"></a>

> Code samples

```bash
curl http://localhost:5555/schema/reload \
  -X POST \
  -H 'Accept: application/json'
```

`POST /schema/reload`

Re-read and re-parse the schema from disk (the watcher does this on its own after every save).

> Example responses

> 200 Response

```json
{
  "schema": null,
  "error": "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "diagnostics": [
    {
      "path": "prisma/schema.prisma",
      "range": {
        "start": {
          "line": 1,
          "character": 5
        },
        "end": {
          "line": 1,
          "character": 9
        }
      },
      "message": "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
      "severity": "error"
    }
  ],
  "updatedAt": "2026-09-02T00:00:00.000Z",
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "model User {\n  id Nope @id\n}\n"
    }
  ]
}
```

<h3 id="reloadschema-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Snapshot](#schemasnapshot)|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## writeSchemaFile

<a id="opIdwriteSchemaFile"></a>

> Code samples

```bash
curl http://localhost:5555/schema/files \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "path": "prisma/schema.prisma",
    "content": "model User {\n  id Int @id\n}\n"
  }'
```

`PUT /schema/files`

Write one schema file back to disk and reload, so the returned snapshot reflects the edit.
Only a path listed in `Snapshot.files` can be written (404 otherwise); a file the OS refuses
to write is reported as a validation problem on `path`.

> Body parameter

```json
{
  "path": "prisma/schema.prisma",
  "content": "model User {\n  id Int @id\n}\n"
}
```

<h3 id="writeschemafile-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[FileWrite](#schemafilewrite)|true|none|
|» path|body|object|true|The file path exactly as it appears in `Snapshot.files`|
|» content|body|object|true|The whole new file content|

> Example responses

> 200 Response

```json
{
  "schema": null,
  "error": "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "diagnostics": [
    {
      "path": "prisma/schema.prisma",
      "range": {
        "start": {
          "line": 1,
          "character": 5
        },
        "end": {
          "line": 1,
          "character": 9
        }
      },
      "message": "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
      "severity": "error"
    }
  ],
  "updatedAt": "2026-09-02T00:00:00.000Z",
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "model User {\n  id Nope @id\n}\n"
    }
  ]
}
```

<h3 id="writeschemafile-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Snapshot](#schemasnapshot)|
|404|Not Found|404 Not Found (`application/problem+json`)|None|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## readSchemaEvents

<a id="opIdreadSchemaEvents"></a>

> Code samples

```bash
curl http://localhost:5555/schema/events
```

`GET /schema/events`

Server-sent events: `ready` (data: the current `updatedAt`) on connect, `change` (data: the
new `updatedAt`) after every reload, and `ping` every 15 seconds to keep the connection open.

<h3 id="readschemaevents-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|None|

<aside class="success">
This operation does not require authentication
</aside>

<h1 id="hekireki-studio-api-db">db</h1>

## readDbStatus

<a id="opIdreadDbStatus"></a>

> Code samples

```bash
curl http://localhost:5555/db \
  -H 'Accept: application/json'
```

`GET /db`

The database connection status.

> Example responses

> 200 Response

```json
{
  "connected": true,
  "dialect": "sqlite",
  "url": "file:./dev.db",
  "source": "env",
  "error": null
}
```

<h3 id="readdbstatus-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[DbStatus](#schemadbstatus)|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## readCounts

<a id="opIdreadCounts"></a>

> Code samples

```bash
curl http://localhost:5555/db/counts \
  -H 'Accept: application/json'
```

`GET /db/counts`

Row count of every model that has a table; a model whose count fails is left out.

> Example responses

> 200 Response

```json
{
  "counts": {
    "User": 3,
    "Post": 12
  }
}
```

<h3 id="readcounts-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Counts](#schemacounts)|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## readRows

<a id="opIdreadRows"></a>

> Code samples

```bash
curl 'http://localhost:5555/db/rows/{modelName}' \
  -H 'Accept: application/json'
```

`GET /db/rows/{modelName}`

One page of a model's rows, keyed by field name, ordered by the key fields.

<h3 id="readrows-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|modelName|path|[modelName](#schemamodelname)|true|none|
|skip|query|[skip](#schemaskip)|true|Rows to skip before the page|
|take|query|[take](#schematake)|true|Rows per page|
|search|query|[search](#schemasearch)|false|Text every returned row must contain|

> Example responses

> 200 Response

```json
{
  "rows": [
    {
      "id": 1,
      "email": "ann@example.com",
      "active": true,
      "deletedAt": null
    }
  ],
  "total": 1,
  "skip": 0,
  "take": 100,
  "key": [
    "id"
  ],
  "columns": [
    "id",
    "email",
    "active",
    "deletedAt"
  ]
}
```

<h3 id="readrows-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Rows](#schemarows)|
|404|Not Found|404 Not Found (`application/problem+json`)|None|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## createRow

<a id="opIdcreateRow"></a>

> Code samples

```bash
curl 'http://localhost:5555/db/rows/{modelName}' \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "values": {
      "email": "ann@example.com"
    }
  }'
```

`POST /db/rows/{modelName}`

Insert one row; field names are translated to columns and values to the driver's representation.

> Body parameter

```json
{
  "values": {
    "email": "ann@example.com"
  }
}
```

<h3 id="createrow-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|modelName|path|[modelName](#schemamodelname)|true|none|
|body|body|[InsertBody](#schemainsertbody)|true|none|
|» values|body|object|true|Field values for the new row; omitted fields take their defaults|

> Example responses

> 200 Response

```json
{
  "affected": 1
}
```

<h3 id="createrow-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Affected](#schemaaffected)|
|404|Not Found|404 Not Found (`application/problem+json`)|None|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## deleteRow

<a id="opIddeleteRow"></a>

> Code samples

```bash
curl 'http://localhost:5555/db/rows/{modelName}' \
  -X DELETE \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "where": {
      "id": 1
    }
  }'
```

`DELETE /db/rows/{modelName}`

Delete the row identified by `where`.

> Body parameter

```json
{
  "where": {
    "id": 1
  }
}
```

<h3 id="deleterow-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|modelName|path|[modelName](#schemamodelname)|true|none|
|body|body|[DeleteBody](#schemadeletebody)|true|none|
|» where|body|object|true|The key fields of the row to delete|

> Example responses

> 200 Response

```json
{
  "affected": 1
}
```

<h3 id="deleterow-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Affected](#schemaaffected)|
|404|Not Found|404 Not Found (`application/problem+json`)|None|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## updateRow

<a id="opIdupdateRow"></a>

> Code samples

```bash
curl 'http://localhost:5555/db/rows/{modelName}' \
  -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "where": {
      "id": 1
    },
    "values": {
      "email": "ann@example.org"
    }
  }'
```

`PATCH /db/rows/{modelName}`

Update the row identified by `where`; both parts must name at least one field.

> Body parameter

```json
{
  "where": {
    "id": 1
  },
  "values": {
    "email": "ann@example.org"
  }
}
```

<h3 id="updaterow-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|modelName|path|[modelName](#schemamodelname)|true|none|
|body|body|[UpdateBody](#schemaupdatebody)|true|none|
|» where|body|object|true|The key fields of the row to change|
|» values|body|object|true|The fields to set|

> Example responses

> 200 Response

```json
{
  "affected": 1
}
```

<h3 id="updaterow-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Affected](#schemaaffected)|
|404|Not Found|404 Not Found (`application/problem+json`)|None|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## runSql

<a id="opIdrunSql"></a>

> Code samples

```bash
curl http://localhost:5555/db/sql \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "sql": "SELECT id, email FROM users LIMIT 10"
  }'
```

`POST /db/sql`

Run one statement and return its rows, or the affected count for a write, with the wall time.

> Body parameter

```json
{
  "sql": "SELECT id, email FROM users LIMIT 10"
}
```

<h3 id="runsql-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[SqlBody](#schemasqlbody)|true|none|
|» sql|body|object|true|The statement|

> Example responses

> 200 Response

```json
{
  "columns": [
    "id",
    "email"
  ],
  "rows": [
    {
      "id": 1,
      "email": "ann@example.com"
    }
  ],
  "rowCount": 1,
  "durationMs": 0.4
}
```

<h3 id="runsql-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[SqlResult](#schemasqlresult)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|
|503|Service Unavailable|503 Service Unavailable (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

<h1 id="hekireki-studio-api-prisma">prisma</h1>

## formatSchemaText

<a id="opIdformatSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/format \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\nid Int @id\n}\n"
  }'
```

`POST /prisma/format`

The edits that lay the text out as the Prisma formatter does.

> Body parameter

```json
{
  "text": "model User {\nid Int @id\n}\n"
}
```

<h3 id="formatschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[TextBody](#schematextbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, as Studio loaded it; the first file when omitted|

> Example responses

> 200 Response

```json
{
  "edits": [
    {
      "range": {
        "start": {
          "line": 0,
          "character": 0
        },
        "end": {
          "line": 3,
          "character": 0
        }
      },
      "newText": "model User {\n  id Int @id\n}\n"
    }
  ]
}
```

<h3 id="formatschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Formatted](#schemaformatted)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## lintSchemaText

<a id="opIdlintSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/lint \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "path": "prisma/schema.prisma",
    "text": "model User {\n  id Nope @id\n}\n"
  }'
```

`POST /prisma/lint`

Validate the buffer together with the other loaded files and return its diagnostics.

> Body parameter

```json
{
  "path": "prisma/schema.prisma",
  "text": "model User {\n  id Nope @id\n}\n"
}
```

<h3 id="lintschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[LintBody](#schemalintbody)|true|none|
|» path|body|object|true|The loaded file the text replaces|
|» text|body|object|true|The text being edited|

> Example responses

> 200 Response

```json
{
  "diagnostics": []
}
```

<h3 id="lintschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Diagnostics](#schemadiagnostics)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## symbolsSchemaText

<a id="opIdsymbolsSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/symbols \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\nid Int @id\n}\n"
  }'
```

`POST /prisma/symbols`

The blocks of the text, as the language server's document outline lists them.

> Body parameter

```json
{
  "text": "model User {\nid Int @id\n}\n"
}
```

<h3 id="symbolsschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[TextBody](#schematextbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, as Studio loaded it; the first file when omitted|

> Example responses

> 200 Response

```json
{
  "symbols": []
}
```

<h3 id="symbolsschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Symbols](#schemasymbols)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## completeSchemaText

<a id="opIdcompleteSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/complete \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "datasource db {\n  provider = \n}\n",
    "line": 1,
    "character": 13
  }'
```

`POST /prisma/complete`

Completions the Prisma language server offers at a cursor position.

> Body parameter

```json
{
  "text": "datasource db {\n  provider = \n}\n",
  "line": 1,
  "character": 13
}
```

<h3 id="completeschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[CompleteBody](#schemacompletebody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» line|body|object|true|The cursor line|
|» character|body|object|true|The cursor column|
|» triggerCharacter|body|string|false|The character that opened the list (`@`, `"`, `.`), when one did rather than typing|

> Example responses

> 200 Response

```json
{
  "items": []
}
```

<h3 id="completeschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Completions](#schemacompletions)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## hoverSchemaText

<a id="opIdhoverSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/hover \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\n  id Int @id\n}\n",
    "line": 1,
    "character": 3
  }'
```

`POST /prisma/hover`

What the Prisma language server says about the symbol at a cursor position.

> Body parameter

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 1,
  "character": 3
}
```

<h3 id="hoverschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[PositionBody](#schemapositionbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» line|body|object|true|The cursor line|
|» character|body|object|true|The cursor column|

> Example responses

> 200 Response

```json
{
  "contents": "```prisma\nmodel User {\n\t...\n}\n```",
  "range": {
    "start": {
      "line": 4,
      "character": 9
    },
    "end": {
      "line": 4,
      "character": 13
    }
  }
}
```

<h3 id="hoverschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Hover](#schemahover)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## defineSchemaText

<a id="opIddefineSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/definition \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\n  id Int @id\n}\n",
    "line": 1,
    "character": 3
  }'
```

`POST /prisma/definition`

Where the model, enum or type referenced at a cursor position is declared.

> Body parameter

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 1,
  "character": 3
}
```

<h3 id="defineschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[PositionBody](#schemapositionbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» line|body|object|true|The cursor line|
|» character|body|object|true|The cursor column|

> Example responses

> 200 Response

```json
{
  "locations": []
}
```

<h3 id="defineschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Definition](#schemadefinition)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## referencesSchemaText

<a id="opIdreferencesSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/references \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\n  id Int @id\n}\n",
    "line": 1,
    "character": 3
  }'
```

`POST /prisma/references`

Every place the symbol at a cursor position is used, across the loaded files.

> Body parameter

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 1,
  "character": 3
}
```

<h3 id="referencesschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[PositionBody](#schemapositionbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» line|body|object|true|The cursor line|
|» character|body|object|true|The cursor column|

> Example responses

> 200 Response

```json
{
  "locations": []
}
```

<h3 id="referencesschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[References](#schemareferences)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## renameSchemaText

<a id="opIdrenameSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/rename \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\n  id Int @id\n}\n",
    "line": 0,
    "character": 7,
    "newName": "Account"
  }'
```

`POST /prisma/rename`

The edits that rename the model or enum at a cursor position everywhere it is used.

> Body parameter

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 0,
  "character": 7,
  "newName": "Account"
}
```

<h3 id="renameschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[RenameBody](#schemarenamebody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» line|body|object|true|The cursor line|
|» character|body|object|true|The cursor column|
|» newName|body|string|true|The new name|

> Example responses

> 200 Response

```json
{
  "changes": []
}
```

<h3 id="renameschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Rename](#schemarename)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

## codeActionsSchemaText

<a id="opIdcodeActionsSchemaText"></a>

> Code samples

```bash
curl http://localhost:5555/prisma/code-actions \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "text": "model User {\n  role R\n}\n",
    "range": {
      "start": {
        "line": 1,
        "character": 7
      },
      "end": {
        "line": 1,
        "character": 8
      }
    },
    "diagnostics": []
  }'
```

`POST /prisma/code-actions`

The quick fixes the Prisma language server offers for the diagnostics in a range.

> Body parameter

```json
{
  "text": "model User {\n  role R\n}\n",
  "range": {
    "start": {
      "line": 1,
      "character": 7
    },
    "end": {
      "line": 1,
      "character": 8
    }
  },
  "diagnostics": []
}
```

<h3 id="codeactionsschematext-parameters">Parameters</h3>

|Name|In|Type|Required|Description|
|---|---|---|---|---|
|body|body|[CodeActionBody](#schemacodeactionbody)|true|none|
|» text|body|object|true|The text as typed|
|» path|body|string|false|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|» range|body|object|true|The range the actions are asked for|
|» diagnostics|body|[[LspDiagnostic](#schemalspdiagnostic)]|true|The diagnostics in that range, as the lint route returned them|

> Example responses

> 200 Response

```json
{
  "actions": []
}
```

<h3 id="codeactionsschematext-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[CodeActions](#schemacodeactions)|
|422|Unprocessable Entity|422 Unprocessable Content (`application/problem+json`)|None|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

<h1 id="hekireki-studio-api-docs">docs</h1>

## readDocs

<a id="opIdreadDocs"></a>

> Code samples

```bash
curl http://localhost:5555/docs \
  -H 'Accept: application/json'
```

`GET /docs`

The documentation of the last schema that parsed: models, operations and client API types.

> Example responses

> 200 Response

```json
{
  "models": [],
  "inputTypes": [],
  "outputTypes": [],
  "enumTypes": []
}
```

<h3 id="readdocs-responses">Responses</h3>

|Status|Meaning|Description|Schema|
|---|---|---|---|
|200|OK|The request has succeeded.|[Docs](#schemadocs)|
|500|Internal Server Error|500 Internal Server Error (`application/problem+json`)|None|

<aside class="success">
This operation does not require authentication
</aside>

# Schemas

<h2 id="tocS_SchemaFile">SchemaFile</h2>
<!-- backwards compatibility -->
<a id="schemaschemafile"></a>
<a id="schema_SchemaFile"></a>
<a id="tocSschemafile"></a>
<a id="tocsschemafile"></a>

```json
{
  "path": "prisma/schema.prisma",
  "content": "model User {\n  id Int @id\n}\n"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|string|true|none|The file path as Studio loaded it (the value to send back as `FileWrite.path`)|
|content|string|true|none|The whole file content|

<h2 id="tocS_FieldKind">FieldKind</h2>
<!-- backwards compatibility -->
<a id="schemafieldkind"></a>
<a id="schema_FieldKind"></a>
<a id="tocSfieldkind"></a>
<a id="tocsfieldkind"></a>

```json
"scalar"
```

<h2 id="tocS_FieldRelation">FieldRelation</h2>
<!-- backwards compatibility -->
<a id="schemafieldrelation"></a>
<a id="schema_FieldRelation"></a>
<a id="tocSfieldrelation"></a>
<a id="tocsfieldrelation"></a>

```json
{
  "name": "PostToUser",
  "fromFields": [
    "authorId"
  ],
  "toFields": [
    "id"
  ],
  "onDelete": "Cascade",
  "onUpdate": null
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The relation name (`@relation("name")`, or the one Prisma derived)|
|fromFields|[string]|true|none|The fields on this model that hold the foreign key|
|toFields|[string]|true|none|The fields on the other model the key references|
|onDelete|string|true|none|The `onDelete` referential action, when declared|
|onUpdate|string|true|none|The `onUpdate` referential action, when declared|

<h2 id="tocS_Field">Field</h2>
<!-- backwards compatibility -->
<a id="schemafield"></a>
<a id="schema_Field"></a>
<a id="tocSfield"></a>
<a id="tocsfield"></a>

```json
{
  "name": "authorId",
  "dbName": "author_id",
  "kind": "scalar",
  "type": "Int",
  "isList": false,
  "isRequired": true,
  "isId": false,
  "isUnique": false,
  "isUpdatedAt": false,
  "isForeignKey": true,
  "default": null,
  "nativeType": null,
  "documentation": "The author of the post",
  "annotations": [
    "@z.int().positive()"
  ],
  "relation": null,
  "attributes": [
    "@map(\"author_id\")"
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The field name|
|dbName|string|true|none|The column name from `@map`, when it differs|
|kind|object|true|none|What the field holds|
|type|string|true|none|The Prisma type: a scalar, a model or an enum name|
|isList|boolean|true|none|Whether the field is a list (`String[]`)|
|isRequired|boolean|true|none|Whether the field is required (no `?`)|
|isId|boolean|true|none|Whether the field is `@id`|
|isUnique|boolean|true|none|Whether the field is `@unique`|
|isUpdatedAt|boolean|true|none|Whether the field is `@updatedAt`|
|isForeignKey|boolean|true|none|Whether the field holds the foreign key of a relation on this model|
|default|string|true|none|The `@default(...)` value rendered as written, when declared|
|nativeType|string|true|none|The `@db.*` native type rendered as written, when declared|
|documentation|string|true|none|The `///` doc comment with hekireki annotations stripped|
|annotations|[string]|true|none|The hekireki annotation lines (`@z.*`, `@v.*`, ...) found in the doc comment|
|relation|object|true|none|The `@relation(...)` attribute of a relation field|
|attributes|[string]|true|none|Every attribute rendered as written (`@id`, `@default(now())`, `@map("...")`, ...)|

<h2 id="tocS_IndexType">IndexType</h2>
<!-- backwards compatibility -->
<a id="schemaindextype"></a>
<a id="schema_IndexType"></a>
<a id="tocSindextype"></a>
<a id="tocsindextype"></a>

```json
"id"
```

<h2 id="tocS_Index">Index</h2>
<!-- backwards compatibility -->
<a id="schemaindex"></a>
<a id="schema_Index"></a>
<a id="tocSindex"></a>
<a id="tocsindex"></a>

```json
{
  "type": "unique",
  "name": null,
  "dbName": "users_email_key",
  "fields": [
    "email"
  ],
  "attribute": "@@unique([email], map: \"users_email_key\")"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|object|true|none|The kind of index|
|name|string|true|none|The Prisma-side index name, when declared|
|dbName|string|true|none|The database-side index name (`map`), when declared|
|fields|[string]|true|none|The fields the index covers, in order|
|attribute|string|true|none|The attribute rendered as written|

<h2 id="tocS_Location">Location</h2>
<!-- backwards compatibility -->
<a id="schemalocation"></a>
<a id="schema_Location"></a>
<a id="tocSlocation"></a>
<a id="tocslocation"></a>

```json
{
  "file": "prisma/schema.prisma",
  "line": 12
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|file|string|true|none|The file that declares the block|
|line|integer(int32)|true|none|The 1-based line of the `model` / `enum` keyword|

<h2 id="tocS_Model">Model</h2>
<!-- backwards compatibility -->
<a id="schemamodel"></a>
<a id="schema_Model"></a>
<a id="tocSmodel"></a>
<a id="tocsmodel"></a>

```json
{
  "name": "User",
  "dbName": "users",
  "documentation": "A registered account",
  "annotations": [],
  "fields": [
    {
      "name": "id",
      "dbName": null,
      "kind": "scalar",
      "type": "Int",
      "isList": false,
      "isRequired": true,
      "isId": true,
      "isUnique": false,
      "isUpdatedAt": false,
      "isForeignKey": false,
      "default": "autoincrement()",
      "nativeType": null,
      "documentation": null,
      "annotations": [],
      "relation": null,
      "attributes": [
        "@id",
        "@default(autoincrement())"
      ]
    }
  ],
  "primaryKey": null,
  "indexes": [],
  "attributes": [
    "@@map(\"users\")"
  ],
  "location": {
    "file": "prisma/schema.prisma",
    "line": 12
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The model name|
|dbName|string|true|none|The table name from `@@map`, when it differs|
|documentation|string|true|none|The `///` doc comment with hekireki annotations stripped|
|annotations|[string]|true|none|The hekireki annotation lines found in the doc comment|
|fields|[[Field](#schemafield)]|true|none|The fields in declaration order|
|primaryKey|[string]|true|none|The `@@id` fields, when the primary key is composite|
|indexes|[[Index](#schemaindex)]|true|none|The `@@` index attributes|
|attributes|[string]|true|none|Every `@@` attribute rendered as written|
|location|object|true|none|Where the block starts (null when it could not be located)|

<h2 id="tocS_EnumValue">EnumValue</h2>
<!-- backwards compatibility -->
<a id="schemaenumvalue"></a>
<a id="schema_EnumValue"></a>
<a id="tocSenumvalue"></a>
<a id="tocsenumvalue"></a>

```json
{
  "name": "ADMIN",
  "dbName": "admin"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The member name|
|dbName|string|true|none|The stored value from `@map`, when it differs|

<h2 id="tocS_Enum">Enum</h2>
<!-- backwards compatibility -->
<a id="schemaenum"></a>
<a id="schema_Enum"></a>
<a id="tocSenum"></a>
<a id="tocsenum"></a>

```json
{
  "name": "Role",
  "dbName": null,
  "documentation": "What an account may do",
  "values": [
    {
      "name": "ADMIN",
      "dbName": "admin"
    },
    {
      "name": "VIEWER",
      "dbName": null
    }
  ],
  "location": {
    "file": "prisma/schema.prisma",
    "line": 40
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The enum name|
|dbName|string|true|none|The type name from `@@map`, when it differs|
|documentation|string|true|none|The `///` doc comment|
|values|[[EnumValue](#schemaenumvalue)]|true|none|The members in declaration order|
|location|object|true|none|Where the block starts (null when it could not be located)|

<h2 id="tocS_RelationOrigin">RelationOrigin</h2>
<!-- backwards compatibility -->
<a id="schemarelationorigin"></a>
<a id="schema_RelationOrigin"></a>
<a id="tocSrelationorigin"></a>
<a id="tocsrelationorigin"></a>

```json
"inferred"
```

<h2 id="tocS_Cardinality">Cardinality</h2>
<!-- backwards compatibility -->
<a id="schemacardinality"></a>
<a id="schema_Cardinality"></a>
<a id="tocScardinality"></a>
<a id="tocscardinality"></a>

```json
"zero-one"
```

<h2 id="tocS_RelationEnd">RelationEnd</h2>
<!-- backwards compatibility -->
<a id="schemarelationend"></a>
<a id="schema_RelationEnd"></a>
<a id="tocSrelationend"></a>
<a id="tocsrelationend"></a>

```json
{
  "model": "Post",
  "field": "authorId",
  "cardinality": "many"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|model|string|true|none|The model on this end|
|field|string|true|none|The field on this end (the key field, or the list field of an implicit many-to-many)|
|cardinality|object|true|none|How many rows this end points at|

<h2 id="tocS_Relation">Relation</h2>
<!-- backwards compatibility -->
<a id="schemarelation"></a>
<a id="schema_Relation"></a>
<a id="tocSrelation"></a>
<a id="tocsrelation"></a>

```json
{
  "id": "User.id->Post.authorId",
  "name": "PostToUser",
  "origin": "inferred",
  "from": {
    "model": "User",
    "field": "id",
    "cardinality": "one"
  },
  "to": {
    "model": "Post",
    "field": "authorId",
    "cardinality": "many"
  },
  "onDelete": "Cascade",
  "onUpdate": null
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|id|string|true|none|A stable id built from both ends (`From.field->To.field`)|
|name|string|true|none|The relation name, when one is declared or derived|
|origin|object|true|none|Where the relation came from|
|from|object|true|none|The referenced end|
|to|object|true|none|The referencing end|
|onDelete|string|true|none|The `onDelete` referential action, when declared|
|onUpdate|string|true|none|The `onUpdate` referential action, when declared|

<h2 id="tocS_Schema">Schema</h2>
<!-- backwards compatibility -->
<a id="schemaschema"></a>
<a id="schema_Schema"></a>
<a id="tocSschema"></a>
<a id="tocsschema"></a>

```json
{
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "model User {\n  id Int @id\n}\n"
    }
  ],
  "provider": "postgresql",
  "models": [],
  "enums": [],
  "relations": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|files|[[SchemaFile](#schemaschemafile)]|true|none|The files the schema was parsed from|
|provider|string|true|none|The `datasource` provider, when one is declared|
|models|[[Model](#schemamodel)]|true|none|Every model in declaration order|
|enums|[[Enum](#schemaenum)]|true|none|Every enum in declaration order|
|relations|[[Relation](#schemarelation)]|true|none|Every relation between the models|

<h2 id="tocS_line">line</h2>
<!-- backwards compatibility -->
<a id="schemaline"></a>
<a id="schema_line"></a>
<a id="tocSline"></a>
<a id="tocsline"></a>

```json
0
```

<h2 id="tocS_character">character</h2>
<!-- backwards compatibility -->
<a id="schemacharacter"></a>
<a id="schema_character"></a>
<a id="tocScharacter"></a>
<a id="tocscharacter"></a>

```json
0
```

<h2 id="tocS_LspPosition">LspPosition</h2>
<!-- backwards compatibility -->
<a id="schemalspposition"></a>
<a id="schema_LspPosition"></a>
<a id="tocSlspposition"></a>
<a id="tocslspposition"></a>

```json
{
  "line": 4,
  "character": 6
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|line|object|true|none|The line|
|character|object|true|none|The column|

<h2 id="tocS_LspRange">LspRange</h2>
<!-- backwards compatibility -->
<a id="schemalsprange"></a>
<a id="schema_LspRange"></a>
<a id="tocSlsprange"></a>
<a id="tocslsprange"></a>

```json
{
  "start": {
    "line": 4,
    "character": 6
  },
  "end": {
    "line": 4,
    "character": 10
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|start|object|true|none|Where the range starts|
|end|object|true|none|Where the range ends|

<h2 id="tocS_Severity">Severity</h2>
<!-- backwards compatibility -->
<a id="schemaseverity"></a>
<a id="schema_Severity"></a>
<a id="tocSseverity"></a>
<a id="tocsseverity"></a>

```json
"error"
```

<h2 id="tocS_FileDiagnostic">FileDiagnostic</h2>
<!-- backwards compatibility -->
<a id="schemafilediagnostic"></a>
<a id="schema_FileDiagnostic"></a>
<a id="tocSfilediagnostic"></a>
<a id="tocsfilediagnostic"></a>

```json
{
  "path": "prisma/schema.prisma",
  "range": {
    "start": {
      "line": 1,
      "character": 5
    },
    "end": {
      "line": 1,
      "character": 9
    }
  },
  "message": "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "severity": "error"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|string|true|none|The file, as Studio loaded it|
|range|object|true|none|Where it is (0-based, end exclusive)|
|message|string|true|none|The Prisma message|
|severity|object|true|none|How serious it is|

<h2 id="tocS_Snapshot">Snapshot</h2>
<!-- backwards compatibility -->
<a id="schemasnapshot"></a>
<a id="schema_Snapshot"></a>
<a id="tocSsnapshot"></a>
<a id="tocssnapshot"></a>

```json
{
  "schema": null,
  "error": "error: Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "diagnostics": [
    {
      "path": "prisma/schema.prisma",
      "range": {
        "start": {
          "line": 1,
          "character": 5
        },
        "end": {
          "line": 1,
          "character": 9
        }
      },
      "message": "Type \"Nope\" is neither a built-in type, nor refers to another model, composite type, or enum.",
      "severity": "error"
    }
  ],
  "updatedAt": "2026-09-02T00:00:00.000Z",
  "files": [
    {
      "path": "prisma/schema.prisma",
      "content": "model User {\n  id Nope @id\n}\n"
    }
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|schema|object|true|none|The last schema that parsed, or null before the first successful parse|
|error|string|true|none|The Prisma error of the latest parse as the engine printed it, or null when it succeeded|
|diagnostics|[[FileDiagnostic](#schemafilediagnostic)]|true|none|Every diagnostic the language server reports for the files on disk; empty when they parse|
|updatedAt|string(date-time)|true|none|When the files were last read (ISO 8601); the event stream announces every change of it|
|files|[[SchemaFile](#schemaschemafile)]|true|none|The files on disk as of the latest read|

<h2 id="tocS_InternalServerProblem">InternalServerProblem</h2>
<!-- backwards compatibility -->
<a id="schemainternalserverproblem"></a>
<a id="schema_InternalServerProblem"></a>
<a id="tocSinternalserverproblem"></a>
<a id="tocsinternalserverproblem"></a>

```json
{
  "type": "/problems/internal-server-error",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "An unexpected error occurred.",
  "instance": "/api/schema"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|Problem type identifier (relative URI reference)|
|title|string|true|none|Short, human-readable summary of the problem type|
|status|number|true|none|HTTP status code, restated in the body per RFC 9457|
|detail|string|true|none|Human-readable explanation specific to this occurrence|
|instance|string|true|none|URI reference identifying this occurrence (the request path)|

#### Enumerated Values

|Property|Value|
|---|---|
|type|/problems/internal-server-error|
|title|Internal Server Error|
|status|500|

<h2 id="tocS_NotFoundProblem">NotFoundProblem</h2>
<!-- backwards compatibility -->
<a id="schemanotfoundproblem"></a>
<a id="schema_NotFoundProblem"></a>
<a id="tocSnotfoundproblem"></a>
<a id="tocsnotfoundproblem"></a>

```json
{
  "type": "/problems/not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Unknown model \"Nope\".",
  "instance": "/api/db/rows/Nope"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|Problem type identifier (relative URI reference)|
|title|string|true|none|Short, human-readable summary of the problem type|
|status|number|true|none|HTTP status code, restated in the body per RFC 9457|
|detail|string|true|none|Human-readable explanation specific to this occurrence|
|instance|string|true|none|URI reference identifying this occurrence (the request path)|

#### Enumerated Values

|Property|Value|
|---|---|
|type|/problems/not-found|
|title|Not Found|
|status|404|

<h2 id="tocS_FieldError">FieldError</h2>
<!-- backwards compatibility -->
<a id="schemafielderror"></a>
<a id="schema_FieldError"></a>
<a id="tocSfielderror"></a>
<a id="tocsfielderror"></a>

```json
{
  "field": "take",
  "message": "take must be 1000 or fewer"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|field|string|true|none|Dot-separated path of the field the error occurred on|
|message|string|true|none|The validation message|

<h2 id="tocS_ValidationProblem">ValidationProblem</h2>
<!-- backwards compatibility -->
<a id="schemavalidationproblem"></a>
<a id="schema_ValidationProblem"></a>
<a id="tocSvalidationproblem"></a>
<a id="tocsvalidationproblem"></a>

```json
{
  "type": "/problems/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request failed validation. See `errors` for the offending fields.",
  "instance": "/api/db/rows/User",
  "errors": [
    {
      "field": "take",
      "message": "take must be 1000 or fewer"
    }
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|Problem type identifier (relative URI reference)|
|title|string|true|none|Short, human-readable summary of the problem type|
|status|number|true|none|HTTP status code, restated in the body per RFC 9457|
|detail|string|true|none|Human-readable explanation specific to this occurrence|
|instance|string|true|none|URI reference identifying this occurrence (the request path)|
|errors|[[FieldError](#schemafielderror)]|true|none|Extension member: one entry per field that failed validation|

#### Enumerated Values

|Property|Value|
|---|---|
|type|/problems/validation-failed|
|title|Validation Failed|
|status|422|

<h2 id="tocS_schemaFilePath">schemaFilePath</h2>
<!-- backwards compatibility -->
<a id="schemaschemafilepath"></a>
<a id="schema_schemaFilePath"></a>
<a id="tocSschemafilepath"></a>
<a id="tocsschemafilepath"></a>

```json
"string"
```

<h2 id="tocS_schemaText">schemaText</h2>
<!-- backwards compatibility -->
<a id="schemaschematext"></a>
<a id="schema_schemaText"></a>
<a id="tocSschematext"></a>
<a id="tocsschematext"></a>

```json
"string"
```

<h2 id="tocS_FileWrite">FileWrite</h2>
<!-- backwards compatibility -->
<a id="schemafilewrite"></a>
<a id="schema_FileWrite"></a>
<a id="tocSfilewrite"></a>
<a id="tocsfilewrite"></a>

```json
{
  "path": "prisma/schema.prisma",
  "content": "model User {\n  id Int @id\n}\n"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|object|true|none|The file path exactly as it appears in `Snapshot.files`|
|content|object|true|none|The whole new file content|

<h2 id="tocS_Dialect">Dialect</h2>
<!-- backwards compatibility -->
<a id="schemadialect"></a>
<a id="schema_Dialect"></a>
<a id="tocSdialect"></a>
<a id="tocsdialect"></a>

```json
"postgresql"
```

<h2 id="tocS_UrlSource">UrlSource</h2>
<!-- backwards compatibility -->
<a id="schemaurlsource"></a>
<a id="schema_UrlSource"></a>
<a id="tocSurlsource"></a>
<a id="tocsurlsource"></a>

```json
"flag"
```

<h2 id="tocS_DbStatus">DbStatus</h2>
<!-- backwards compatibility -->
<a id="schemadbstatus"></a>
<a id="schema_DbStatus"></a>
<a id="tocSdbstatus"></a>
<a id="tocsdbstatus"></a>

```json
{
  "connected": true,
  "dialect": "sqlite",
  "url": "file:./dev.db",
  "source": "env",
  "error": null
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|connected|boolean|true|none|Whether a driver is open|
|dialect|object|true|none|The dialect of the open driver|
|url|string|true|none|The connection URL with its password redacted|
|source|object|true|none|Where the URL was found|
|error|string|true|none|Why no database is connected, when it is not|

<h2 id="tocS_Counts">Counts</h2>
<!-- backwards compatibility -->
<a id="schemacounts"></a>
<a id="schema_Counts"></a>
<a id="tocScounts"></a>
<a id="tocscounts"></a>

```json
{
  "counts": {
    "User": 3,
    "Post": 12
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|counts|object|true|none|Model name → number of rows|

<h2 id="tocS_ServiceUnavailableProblem">ServiceUnavailableProblem</h2>
<!-- backwards compatibility -->
<a id="schemaserviceunavailableproblem"></a>
<a id="schema_ServiceUnavailableProblem"></a>
<a id="tocSserviceunavailableproblem"></a>
<a id="tocsserviceunavailableproblem"></a>

```json
{
  "type": "/problems/service-unavailable",
  "title": "Service Unavailable",
  "status": 503,
  "detail": "No database is connected. Set DATABASE_URL or pass --url to hekireki studio.",
  "instance": "/api/db/counts"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|Problem type identifier (relative URI reference)|
|title|string|true|none|Short, human-readable summary of the problem type|
|status|number|true|none|HTTP status code, restated in the body per RFC 9457|
|detail|string|true|none|Human-readable explanation specific to this occurrence|
|instance|string|true|none|URI reference identifying this occurrence (the request path)|

#### Enumerated Values

|Property|Value|
|---|---|
|type|/problems/service-unavailable|
|title|Service Unavailable|
|status|503|

<h2 id="tocS_modelName">modelName</h2>
<!-- backwards compatibility -->
<a id="schemamodelname"></a>
<a id="schema_modelName"></a>
<a id="tocSmodelname"></a>
<a id="tocsmodelname"></a>

```json
"string"
```

<h2 id="tocS_skip">skip</h2>
<!-- backwards compatibility -->
<a id="schemaskip"></a>
<a id="schema_skip"></a>
<a id="tocSskip"></a>
<a id="tocsskip"></a>

```json
0
```

<h2 id="tocS_take">take</h2>
<!-- backwards compatibility -->
<a id="schematake"></a>
<a id="schema_take"></a>
<a id="tocStake"></a>
<a id="tocstake"></a>

```json
1
```

<h2 id="tocS_search">search</h2>
<!-- backwards compatibility -->
<a id="schemasearch"></a>
<a id="schema_search"></a>
<a id="tocSsearch"></a>
<a id="tocssearch"></a>

```json
"string"
```

<h2 id="tocS_Row">Row</h2>
<!-- backwards compatibility -->
<a id="schemarow"></a>
<a id="schema_Row"></a>
<a id="tocSrow"></a>
<a id="tocsrow"></a>

```json
{
  "id": 1,
  "email": "ann@example.com",
  "active": true,
  "deletedAt": null
}
```

<h2 id="tocS_Rows">Rows</h2>
<!-- backwards compatibility -->
<a id="schemarows"></a>
<a id="schema_Rows"></a>
<a id="tocSrows"></a>
<a id="tocsrows"></a>

```json
{
  "rows": [
    {
      "id": 1,
      "email": "ann@example.com",
      "active": true,
      "deletedAt": null
    }
  ],
  "total": 1,
  "skip": 0,
  "take": 100,
  "key": [
    "id"
  ],
  "columns": [
    "id",
    "email",
    "active",
    "deletedAt"
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|rows|[[Row](#schemarow)]|true|none|The rows of the page|
|total|integer(int32)|true|none|How many rows match the search in total|
|skip|integer(int32)|true|none|The skip the page was read with|
|take|integer(int32)|true|none|The take the page was read with|
|key|[string]|true|none|The fields that identify a row (the primary key, else the unique fields)|
|columns|[string]|true|none|The fields the table has, in declaration order|

<h2 id="tocS_Affected">Affected</h2>
<!-- backwards compatibility -->
<a id="schemaaffected"></a>
<a id="schema_Affected"></a>
<a id="tocSaffected"></a>
<a id="tocsaffected"></a>

```json
{
  "affected": 1
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|affected|integer(int32)|true|none|The driver's affected-row count|

<h2 id="tocS_InsertBody">InsertBody</h2>
<!-- backwards compatibility -->
<a id="schemainsertbody"></a>
<a id="schema_InsertBody"></a>
<a id="tocSinsertbody"></a>
<a id="tocsinsertbody"></a>

```json
{
  "values": {
    "email": "ann@example.com"
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|values|object|true|none|Field values for the new row; omitted fields take their defaults|

<h2 id="tocS_UpdateBody">UpdateBody</h2>
<!-- backwards compatibility -->
<a id="schemaupdatebody"></a>
<a id="schema_UpdateBody"></a>
<a id="tocSupdatebody"></a>
<a id="tocsupdatebody"></a>

```json
{
  "where": {
    "id": 1
  },
  "values": {
    "email": "ann@example.org"
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|where|object|true|none|The key fields of the row to change|
|values|object|true|none|The fields to set|

<h2 id="tocS_DeleteBody">DeleteBody</h2>
<!-- backwards compatibility -->
<a id="schemadeletebody"></a>
<a id="schema_DeleteBody"></a>
<a id="tocSdeletebody"></a>
<a id="tocsdeletebody"></a>

```json
{
  "where": {
    "id": 1
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|where|object|true|none|The key fields of the row to delete|

<h2 id="tocS_SqlResult">SqlResult</h2>
<!-- backwards compatibility -->
<a id="schemasqlresult"></a>
<a id="schema_SqlResult"></a>
<a id="tocSsqlresult"></a>
<a id="tocssqlresult"></a>

```json
{
  "columns": [
    "id",
    "email"
  ],
  "rows": [
    {
      "id": 1,
      "email": "ann@example.com"
    }
  ],
  "rowCount": 1,
  "durationMs": 0.4
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|columns|[string]|true|none|The column names of the result set (empty for a write)|
|rows|[[Row](#schemarow)]|true|none|The rows of the result set keyed by column name (empty for a write)|
|rowCount|integer(int32)|true|none|Rows returned, or rows affected for a write|
|durationMs|number(double)|true|none|Wall time of the statement in milliseconds|

<h2 id="tocS_sql">sql</h2>
<!-- backwards compatibility -->
<a id="schemasql"></a>
<a id="schema_sql"></a>
<a id="tocSsql"></a>
<a id="tocssql"></a>

```json
"string"
```

<h2 id="tocS_SqlBody">SqlBody</h2>
<!-- backwards compatibility -->
<a id="schemasqlbody"></a>
<a id="schema_SqlBody"></a>
<a id="tocSsqlbody"></a>
<a id="tocssqlbody"></a>

```json
{
  "sql": "SELECT id, email FROM users LIMIT 10"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|sql|object|true|none|The statement|

<h2 id="tocS_LspTextEdit">LspTextEdit</h2>
<!-- backwards compatibility -->
<a id="schemalsptextedit"></a>
<a id="schema_LspTextEdit"></a>
<a id="tocSlsptextedit"></a>
<a id="tocslsptextedit"></a>

```json
{
  "range": {
    "start": {
      "line": 4,
      "character": 6
    },
    "end": {
      "line": 4,
      "character": 10
    }
  },
  "newText": "Account"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|range|object|true|none|What to replace|
|newText|string|true|none|The replacement|

<h2 id="tocS_Formatted">Formatted</h2>
<!-- backwards compatibility -->
<a id="schemaformatted"></a>
<a id="schema_Formatted"></a>
<a id="tocSformatted"></a>
<a id="tocsformatted"></a>

```json
{
  "edits": [
    {
      "range": {
        "start": {
          "line": 0,
          "character": 0
        },
        "end": {
          "line": 3,
          "character": 0
        }
      },
      "newText": "model User {\n  id Int @id\n}\n"
    }
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|edits|[[LspTextEdit](#schemalsptextedit)]|true|none|The replacements that lay the text out as the Prisma formatter does; empty when it already is|

<h2 id="tocS_TextBody">TextBody</h2>
<!-- backwards compatibility -->
<a id="schematextbody"></a>
<a id="schema_TextBody"></a>
<a id="tocStextbody"></a>
<a id="tocstextbody"></a>

```json
{
  "text": "model User {\nid Int @id\n}\n"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|text|object|true|none|The text as typed|
|path|string|false|none|The file the text belongs to, as Studio loaded it; the first file when omitted|

<h2 id="tocS_LspDiagnostic">LspDiagnostic</h2>
<!-- backwards compatibility -->
<a id="schemalspdiagnostic"></a>
<a id="schema_LspDiagnostic"></a>
<a id="tocSlspdiagnostic"></a>
<a id="tocslspdiagnostic"></a>

```json
{
  "range": {
    "start": {
      "line": 7,
      "character": 7
    },
    "end": {
      "line": 7,
      "character": 8
    }
  },
  "message": "Type \"R\" is neither a built-in type, nor refers to another model, composite type, or enum.",
  "severity": "error"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|range|object|true|none|Where it is|
|message|string|true|none|The Prisma message|
|severity|object|true|none|How serious it is|

<h2 id="tocS_Diagnostics">Diagnostics</h2>
<!-- backwards compatibility -->
<a id="schemadiagnostics"></a>
<a id="schema_Diagnostics"></a>
<a id="tocSdiagnostics"></a>
<a id="tocsdiagnostics"></a>

```json
{
  "diagnostics": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|diagnostics|[[LspDiagnostic](#schemalspdiagnostic)]|true|none|Every diagnostic the language server reported for the file|

<h2 id="tocS_LintBody">LintBody</h2>
<!-- backwards compatibility -->
<a id="schemalintbody"></a>
<a id="schema_LintBody"></a>
<a id="tocSlintbody"></a>
<a id="tocslintbody"></a>

```json
{
  "path": "prisma/schema.prisma",
  "text": "model User {\n  id Nope @id\n}\n"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|object|true|none|The loaded file the text replaces|
|text|object|true|none|The text being edited|

<h2 id="tocS_LspDocumentSymbol">LspDocumentSymbol</h2>
<!-- backwards compatibility -->
<a id="schemalspdocumentsymbol"></a>
<a id="schema_LspDocumentSymbol"></a>
<a id="tocSlspdocumentsymbol"></a>
<a id="tocslspdocumentsymbol"></a>

```json
{
  "name": "User",
  "kind": 5,
  "range": {
    "start": {
      "line": 4,
      "character": 0
    },
    "end": {
      "line": 9,
      "character": 1
    }
  },
  "selectionRange": {
    "start": {
      "line": 4,
      "character": 6
    },
    "end": {
      "line": 4,
      "character": 10
    }
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The declared name|
|kind|integer(int32)|true|none|The LSP `SymbolKind`: 5 = model or view, 10 = enum, 11 = composite type, 23 = datasource, 12 = generator|
|range|object|true|none|The whole block|
|selectionRange|object|true|none|The name inside the block header|

<h2 id="tocS_Symbols">Symbols</h2>
<!-- backwards compatibility -->
<a id="schemasymbols"></a>
<a id="schema_Symbols"></a>
<a id="tocSsymbols"></a>
<a id="tocssymbols"></a>

```json
{
  "symbols": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|symbols|[[LspDocumentSymbol](#schemalspdocumentsymbol)]|true|none|Every block of the text|

<h2 id="tocS_InsertTextFormat">InsertTextFormat</h2>
<!-- backwards compatibility -->
<a id="schemainserttextformat"></a>
<a id="schema_InsertTextFormat"></a>
<a id="tocSinserttextformat"></a>
<a id="tocsinserttextformat"></a>

```json
"plainText"
```

<h2 id="tocS_Completion">Completion</h2>
<!-- backwards compatibility -->
<a id="schemacompletion"></a>
<a id="schema_Completion"></a>
<a id="tocScompletion"></a>
<a id="tocscompletion"></a>

```json
{
  "label": "postgresql",
  "kind": 12,
  "detail": null,
  "documentation": "The PostgreSQL provider",
  "insertText": "\"postgresql\"",
  "insertTextFormat": "plainText",
  "sortText": null
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|label|string|true|none|What the completion list shows|
|kind|integer(int32)|true|none|The LSP `CompletionItemKind` (13 = enum value, 14 = keyword, 10 = property, ...), when the server gives one|
|detail|string|true|none|A short type or kind, when the server gives one|
|documentation|string|true|none|The documentation text (Markdown), when the server gives one|
|insertText|string|true|none|The text to insert; a snippet keeps its tab stops|
|insertTextFormat|object|true|none|Whether `insertText` is plain text or a snippet|
|sortText|string|true|none|The key the list is sorted by, when the server gives one|

<h2 id="tocS_Completions">Completions</h2>
<!-- backwards compatibility -->
<a id="schemacompletions"></a>
<a id="schema_Completions"></a>
<a id="tocScompletions"></a>
<a id="tocscompletions"></a>

```json
{
  "items": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|items|[[Completion](#schemacompletion)]|true|none|The offered completions in the server's order|

<h2 id="tocS_CompleteBody">CompleteBody</h2>
<!-- backwards compatibility -->
<a id="schemacompletebody"></a>
<a id="schema_CompleteBody"></a>
<a id="tocScompletebody"></a>
<a id="tocscompletebody"></a>

```json
{
  "text": "datasource db {\n  provider = \n}\n",
  "line": 1,
  "character": 13
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|text|object|true|none|The text as typed|
|path|string|false|none|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|line|object|true|none|The cursor line|
|character|object|true|none|The cursor column|
|triggerCharacter|string|false|none|The character that opened the list (`@`, `"`, `.`), when one did rather than typing|

<h2 id="tocS_Hover">Hover</h2>
<!-- backwards compatibility -->
<a id="schemahover"></a>
<a id="schema_Hover"></a>
<a id="tocShover"></a>
<a id="tocshover"></a>

```json
{
  "contents": "```prisma\nmodel User {\n\t...\n}\n```",
  "range": {
    "start": {
      "line": 4,
      "character": 9
    },
    "end": {
      "line": 4,
      "character": 13
    }
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|contents|string|true|none|Markdown to show, or null when there is nothing to say about the position|
|range|object|true|none|The word the hover is about, when the server names it|

<h2 id="tocS_PositionBody">PositionBody</h2>
<!-- backwards compatibility -->
<a id="schemapositionbody"></a>
<a id="schema_PositionBody"></a>
<a id="tocSpositionbody"></a>
<a id="tocspositionbody"></a>

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 1,
  "character": 3
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|text|object|true|none|The text as typed|
|path|string|false|none|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|line|object|true|none|The cursor line|
|character|object|true|none|The cursor column|

<h2 id="tocS_LspLocation">LspLocation</h2>
<!-- backwards compatibility -->
<a id="schemalsplocation"></a>
<a id="schema_LspLocation"></a>
<a id="tocSlsplocation"></a>
<a id="tocslsplocation"></a>

```json
{
  "path": "prisma/schema.prisma",
  "range": {
    "start": {
      "line": 10,
      "character": 0
    },
    "end": {
      "line": 14,
      "character": 1
    }
  },
  "selection": {
    "start": {
      "line": 10,
      "character": 6
    },
    "end": {
      "line": 10,
      "character": 10
    }
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|string|true|none|The file, as Studio loaded it|
|range|object|true|none|The whole declaration|
|selection|object|true|none|The name inside it, to put the cursor on|

<h2 id="tocS_Definition">Definition</h2>
<!-- backwards compatibility -->
<a id="schemadefinition"></a>
<a id="schema_Definition"></a>
<a id="tocSdefinition"></a>
<a id="tocsdefinition"></a>

```json
{
  "locations": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|locations|[[LspLocation](#schemalsplocation)]|true|none|The declarations, empty when the position holds no reference to one|

<h2 id="tocS_LspReference">LspReference</h2>
<!-- backwards compatibility -->
<a id="schemalspreference"></a>
<a id="schema_LspReference"></a>
<a id="tocSlspreference"></a>
<a id="tocslspreference"></a>

```json
{
  "path": "prisma/schema.prisma",
  "range": {
    "start": {
      "line": 21,
      "character": 9
    },
    "end": {
      "line": 21,
      "character": 13
    }
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|string|true|none|The file, as Studio loaded it|
|range|object|true|none|The word that refers to the symbol|

<h2 id="tocS_References">References</h2>
<!-- backwards compatibility -->
<a id="schemareferences"></a>
<a id="schema_References"></a>
<a id="tocSreferences"></a>
<a id="tocsreferences"></a>

```json
{
  "locations": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|locations|[[LspReference](#schemalspreference)]|true|none|The uses, including the declaration; empty when the position holds no symbol|

<h2 id="tocS_LspFileEdit">LspFileEdit</h2>
<!-- backwards compatibility -->
<a id="schemalspfileedit"></a>
<a id="schema_LspFileEdit"></a>
<a id="tocSlspfileedit"></a>
<a id="tocslspfileedit"></a>

```json
{
  "path": "prisma/schema.prisma",
  "edits": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|path|string|true|none|The file, as Studio loaded it|
|edits|[[LspTextEdit](#schemalsptextedit)]|true|none|The replacements, in document order|

<h2 id="tocS_Rename">Rename</h2>
<!-- backwards compatibility -->
<a id="schemarename"></a>
<a id="schema_Rename"></a>
<a id="tocSrename"></a>
<a id="tocsrename"></a>

```json
{
  "changes": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|changes|[[LspFileEdit](#schemalspfileedit)]|true|none|The edits, grouped by file; empty when the position holds nothing to rename|

<h2 id="tocS_RenameBody">RenameBody</h2>
<!-- backwards compatibility -->
<a id="schemarenamebody"></a>
<a id="schema_RenameBody"></a>
<a id="tocSrenamebody"></a>
<a id="tocsrenamebody"></a>

```json
{
  "text": "model User {\n  id Int @id\n}\n",
  "line": 0,
  "character": 7,
  "newName": "Account"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|text|object|true|none|The text as typed|
|path|string|false|none|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|line|object|true|none|The cursor line|
|character|object|true|none|The cursor column|
|newName|string|true|none|The new name|

<h2 id="tocS_CodeAction">CodeAction</h2>
<!-- backwards compatibility -->
<a id="schemacodeaction"></a>
<a id="schema_CodeAction"></a>
<a id="tocScodeaction"></a>
<a id="tocscodeaction"></a>

```json
{
  "title": "Change spelling to 'Role'",
  "changes": [],
  "isPreferred": true
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|title|string|true|none|What the fix does|
|changes|[[LspFileEdit](#schemalspfileedit)]|true|none|The edits, grouped by file|
|isPreferred|boolean|true|none|Whether it is the fix to apply first|

<h2 id="tocS_CodeActions">CodeActions</h2>
<!-- backwards compatibility -->
<a id="schemacodeactions"></a>
<a id="schema_CodeActions"></a>
<a id="tocScodeactions"></a>
<a id="tocscodeactions"></a>

```json
{
  "actions": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|actions|[[CodeAction](#schemacodeaction)]|true|none|The offered fixes|

<h2 id="tocS_CodeActionBody">CodeActionBody</h2>
<!-- backwards compatibility -->
<a id="schemacodeactionbody"></a>
<a id="schema_CodeActionBody"></a>
<a id="tocScodeactionbody"></a>
<a id="tocscodeactionbody"></a>

```json
{
  "text": "model User {\n  role R\n}\n",
  "range": {
    "start": {
      "line": 1,
      "character": 7
    },
    "end": {
      "line": 1,
      "character": 8
    }
  },
  "diagnostics": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|text|object|true|none|The text as typed|
|path|string|false|none|The file the text belongs to, so the other loaded schema files are seen; the first file when omitted|
|range|object|true|none|The range the actions are asked for|
|diagnostics|[[LspDiagnostic](#schemalspdiagnostic)]|true|none|The diagnostics in that range, as the lint route returned them|

<h2 id="tocS_DocsDirective">DocsDirective</h2>
<!-- backwards compatibility -->
<a id="schemadocsdirective"></a>
<a id="schema_DocsDirective"></a>
<a id="tocSdocsdirective"></a>
<a id="tocsdocsdirective"></a>

```json
{
  "name": "@@unique",
  "values": [
    "email"
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The attribute name|
|values|[string]|true|none|The field names the attribute lists|

<h2 id="tocS_DocsField">DocsField</h2>
<!-- backwards compatibility -->
<a id="schemadocsfield"></a>
<a id="schema_DocsField"></a>
<a id="tocSdocsfield"></a>
<a id="tocsdocsfield"></a>

```json
{
  "name": "email",
  "type": "String",
  "bareTypeName": "String",
  "kind": "scalar",
  "directives": [
    "@unique"
  ],
  "documentation": "Sign-in address",
  "required": true
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The field name|
|type|string|true|none|The type as written, with `?` for optional and `[]` for lists|
|bareTypeName|string|true|none|The type name without modifiers, used to link to the output type or enum|
|kind|object|true|none|What the field holds: a relation links to the model's output type, an enum to its enum section|
|directives|[string]|true|none|The field attributes (`@id`, `@unique`, `@default(...)`, `@updatedAt`)|
|documentation|string|true|none|The `///` doc comment|
|required|boolean|true|none|Whether the field is required|

<h2 id="tocS_DocsTypeLocation">DocsTypeLocation</h2>
<!-- backwards compatibility -->
<a id="schemadocstypelocation"></a>
<a id="schema_DocsTypeLocation"></a>
<a id="tocSdocstypelocation"></a>
<a id="tocsdocstypelocation"></a>

```json
"scalar"
```

<h2 id="tocS_DocsTypeRef">DocsTypeRef</h2>
<!-- backwards compatibility -->
<a id="schemadocstyperef"></a>
<a id="schema_DocsTypeRef"></a>
<a id="tocSdocstyperef"></a>
<a id="tocsdocstyperef"></a>

```json
{
  "type": "UserWhereInput",
  "isList": false,
  "location": "inputObjectTypes"
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|The type name: a scalar, an enum, an input type or an output type|
|isList|boolean|true|none|Whether the reference is a list of that type|
|location|object|true|none|Where the type is declared|

<h2 id="tocS_DocsOperationInput">DocsOperationInput</h2>
<!-- backwards compatibility -->
<a id="schemadocsoperationinput"></a>
<a id="schema_DocsOperationInput"></a>
<a id="tocSdocsoperationinput"></a>
<a id="tocsdocsoperationinput"></a>

```json
{
  "name": "where",
  "types": [
    {
      "type": "UserWhereUniqueInput",
      "isList": false,
      "location": "inputObjectTypes"
    }
  ],
  "required": true
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The argument name|
|types|[[DocsTypeRef](#schemadocstyperef)]|true|none|The accepted types|
|required|boolean|true|none|Whether the argument is required|

<h2 id="tocS_DocsOperationOutput">DocsOperationOutput</h2>
<!-- backwards compatibility -->
<a id="schemadocsoperationoutput"></a>
<a id="schema_DocsOperationOutput"></a>
<a id="tocSdocsoperationoutput"></a>
<a id="tocsdocsoperationoutput"></a>

```json
{
  "type": "User",
  "required": true,
  "list": false
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|type|string|true|none|The output type name, when the client API declares the operation|
|required|boolean|true|none|Whether the result is non-null|
|list|boolean|true|none|Whether the result is a list|

<h2 id="tocS_DocsOperation">DocsOperation</h2>
<!-- backwards compatibility -->
<a id="schemadocsoperation"></a>
<a id="schema_DocsOperation"></a>
<a id="tocSdocsoperation"></a>
<a id="tocsdocsoperation"></a>

```json
{
  "name": "findUnique",
  "description": "Find zero or one User",
  "usage": "// Get one User\nconst user = await prisma.user.findUnique({\n  where: {\n    // ... provide filter here\n  }\n})",
  "inputs": [
    {
      "name": "where",
      "types": [
        {
          "type": "UserWhereUniqueInput",
          "isList": false,
          "location": "inputObjectTypes"
        }
      ],
      "required": true
    }
  ],
  "output": {
    "type": "User",
    "required": false,
    "list": false
  }
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The operation name|
|description|string|true|none|What the operation does|
|usage|string|true|none|A usage snippet with the Prisma client|
|inputs|[[DocsOperationInput](#schemadocsoperationinput)]|true|none|The arguments, when the client API declares the operation|
|output|object|true|none|The result|

<h2 id="tocS_DocsModel">DocsModel</h2>
<!-- backwards compatibility -->
<a id="schemadocsmodel"></a>
<a id="schema_DocsModel"></a>
<a id="tocSdocsmodel"></a>
<a id="tocsdocsmodel"></a>

```json
{
  "name": "User",
  "documentation": "A registered account",
  "directives": [
    {
      "name": "@@unique",
      "values": [
        "email"
      ]
    }
  ],
  "fields": [],
  "operations": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The model name|
|documentation|string|true|none|The `///` doc comment|
|directives|[[DocsDirective](#schemadocsdirective)]|true|none|The model-level attributes|
|fields|[[DocsField](#schemadocsfield)]|true|none|The fields in declaration order|
|operations|[[DocsOperation](#schemadocsoperation)]|true|none|The Prisma client operations of the model|

<h2 id="tocS_DocsTypeField">DocsTypeField</h2>
<!-- backwards compatibility -->
<a id="schemadocstypefield"></a>
<a id="schema_DocsTypeField"></a>
<a id="tocSdocstypefield"></a>
<a id="tocsdocstypefield"></a>

```json
{
  "name": "email",
  "types": [
    {
      "type": "String",
      "isList": false,
      "location": "scalar"
    }
  ],
  "nullable": false
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The field name|
|types|[[DocsTypeRef](#schemadocstyperef)]|true|none|The accepted types|
|nullable|boolean|true|none|Whether the field may be null (input types), or is non-null (output types), as the original page shows it|

<h2 id="tocS_DocsType">DocsType</h2>
<!-- backwards compatibility -->
<a id="schemadocstype"></a>
<a id="schema_DocsType"></a>
<a id="tocSdocstype"></a>
<a id="tocsdocstype"></a>

```json
{
  "name": "UserWhereInput",
  "fields": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The type name|
|fields|[[DocsTypeField](#schemadocstypefield)]|true|none|The fields in declaration order|

<h2 id="tocS_DocsEnum">DocsEnum</h2>
<!-- backwards compatibility -->
<a id="schemadocsenum"></a>
<a id="schema_DocsEnum"></a>
<a id="tocSdocsenum"></a>
<a id="tocsdocsenum"></a>

```json
{
  "name": "Role",
  "values": [
    "ADMIN",
    "VIEWER"
  ]
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|name|string|true|none|The enum name|
|values|[string]|true|none|The values in declaration order|

<h2 id="tocS_Docs">Docs</h2>
<!-- backwards compatibility -->
<a id="schemadocs"></a>
<a id="schema_Docs"></a>
<a id="tocSdocs"></a>
<a id="tocsdocs"></a>

```json
{
  "models": [],
  "inputTypes": [],
  "outputTypes": [],
  "enumTypes": []
}
```

### Properties

|Name|Type|Required|Restrictions|Description|
|---|---|---|---|---|
|models|[[DocsModel](#schemadocsmodel)]|true|none|Every model in declaration order|
|inputTypes|[[DocsType](#schemadocstype)]|true|none|The input types of the Prisma client API|
|outputTypes|[[DocsType](#schemadocstype)]|true|none|The output types: the model types, then the aggregate / payload types|
|enumTypes|[[DocsEnum](#schemadocsenum)]|true|none|The enums: the schema enums, then the ones Prisma derives (`SortOrder`, `UserScalarFieldEnum`, ...)|
