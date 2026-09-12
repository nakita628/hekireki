#nullable enable

using NpgsqlTypes;

namespace Example.Models;

public enum Role
{
    [PgName("ADMIN")]
    Admin,

    [PgName("EDITOR")]
    Editor,

    [PgName("VIEWER")]
    Viewer,
}
