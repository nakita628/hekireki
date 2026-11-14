#nullable enable

using System;

namespace Example.Models;

/// <summary>
/// DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
/// </summary>
public partial class AuditLog
{
    public Guid Id { get; set; }

    public string Action { get; set; } = null!;

    public string Payload { get; set; } = "{}";

    public byte[]? Signature { get; set; }

    public DateTime LoggedAt { get; set; }
}
