#nullable enable

using System;

namespace Example.Models;

/// <summary>
/// Composite primary key + two named relations to the same model.
/// </summary>
public partial class Follow
{
    public string FollowerId { get; set; } = null!;

    public string FollowingId { get; set; } = null!;

    public virtual User Follower { get; set; } = null!;

    public virtual User Following { get; set; } = null!;

    public DateTime Since { get; set; }
}
