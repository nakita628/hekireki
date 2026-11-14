#nullable enable

using System.Collections.Generic;

namespace Example.Models;

/// <summary>
/// Self-relation (adjacency-list tree) with a composite unique.
/// </summary>
public partial class Category
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;

    public int? ParentId { get; set; }

    public virtual Category? Parent { get; set; }

    public virtual ICollection<Category> Children { get; set; } = new List<Category>();
}
