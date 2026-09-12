#nullable enable

using NpgsqlTypes;

namespace Example.Models;

public enum Visibility
{
    [PgName("public")]
    Public,

    [PgName("private")]
    Private,

    [PgName("link_only")]
    LinkOnly,
}
