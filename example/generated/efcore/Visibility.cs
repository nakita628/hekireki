#nullable enable

using NpgsqlTypes;

namespace Example.Models;

/// <summary>
/// Enum with @map on every value and @@map on the enum itself:
/// the database stores the mapped values ("link_only"), while
/// generators receive the Prisma-level names ("LINK_ONLY").
/// </summary>
public enum Visibility
{
    [PgName("public")]
    Public,

    [PgName("private")]
    Private,

    [PgName("link_only")]
    LinkOnly,
}
