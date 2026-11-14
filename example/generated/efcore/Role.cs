#nullable enable

using NpgsqlTypes;

namespace Example.Models;

/// <summary>
/// User role. No @map: the value names are stored verbatim.
/// </summary>
public enum Role
{
    [PgName("ADMIN")]
    Admin,

    [PgName("EDITOR")]
    Editor,

    [PgName("VIEWER")]
    Viewer,
}
