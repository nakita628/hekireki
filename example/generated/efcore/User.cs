#nullable enable

using System;
using System.Collections.Generic;

namespace Example.Models;

public partial class User
{
    public string Id { get; set; } = null!;

    public string Email { get; set; } = null!;

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
