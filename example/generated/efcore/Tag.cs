#nullable enable

using System.Collections.Generic;

namespace Example.Models;

public partial class Tag
{
    public int Id { get; set; }

    public string Label { get; set; } = null!;

    public virtual ICollection<Post> Posts { get; set; } = new List<Post>();
}
