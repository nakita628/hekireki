#nullable enable

using System;

namespace Example.Models;

public partial class Follow
{
    public string FollowerId { get; set; } = null!;

    public string FollowingId { get; set; } = null!;

    public virtual User Follower { get; set; } = null!;

    public virtual User Following { get; set; } = null!;

    public DateTime Since { get; set; }
}
