#nullable enable

using System;
using System.Collections.Generic;

namespace Example.Models;

/// <summary>
/// Application user. Fully annotated for every validator generator,
/// with a UUIDv7 primary key, enum default, scalar list, @map columns,
/// @updatedAt, and relations of every cardinality.
/// </summary>
public partial class User
{
    /// <summary>
    /// Primary key (UUIDv7)
    /// </summary>
    public string Id { get; set; } = null!;

    /// <summary>
    /// Unique login email
    /// </summary>
    public string Email { get; set; } = null!;

    /// <summary>
    /// Display name
    /// </summary>
    public string Name { get; set; } = null!;

    public Role Role { get; set; } = Role.Viewer;

    public List<string>? Interests { get; set; } = new List<string>();

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual Profile? Profile { get; set; }

    public virtual ICollection<Post> Posts { get; set; } = new List<Post>();

    public virtual ICollection<Comment> Comments { get; set; } = new List<Comment>();

    public virtual ICollection<Order> Orders { get; set; } = new List<Order>();

    public virtual ICollection<Follow> Followers { get; set; } = new List<Follow>();

    public virtual ICollection<Follow> Following { get; set; } = new List<Follow>();
}
