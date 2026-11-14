#nullable enable

using System;

namespace Example.Models;

/// <summary>
/// One-to-one relation with native @db.* types, literal defaults,
/// and optional scalars of every flavour. ConfigDict passthrough: the
/// Pydantic model rejects unknown keys (extra='forbid').
/// </summary>
public partial class Profile
{
    public string Id { get; set; } = null!;

    public string UserId { get; set; } = null!;

    public virtual User User { get; set; } = null!;

    public string? Bio { get; set; }

    public string Nickname { get; set; } = "anonymous";

    public short? Age { get; set; }

    public decimal Balance { get; set; } = 0m;

    public bool Verified { get; set; } = false;

    public string? Meta { get; set; }

    public byte[]? Avatar { get; set; }

    public DateTime? LastSeen { get; set; }
}
