#nullable enable

using System;
using System.Collections.Generic;

namespace Example.Models;

/// <summary>
/// @@map + @map column names, FK with a referential action,
/// mapped-enum default, and an implicit many-to-many to Tag.
/// </summary>
public partial class Post
{
    /// <summary>
    /// Primary key
    /// </summary>
    public string Id { get; set; } = null!;

    /// <summary>
    /// Article title
    /// </summary>
    public string Title { get; set; } = null!;

    public string? Content { get; set; }

    public Visibility Visibility { get; set; } = Visibility.LinkOnly;

    public bool Published { get; set; } = false;

    public int ViewCount { get; set; } = 0;

    public string AuthorId { get; set; } = null!;

    public virtual User Author { get; set; } = null!;

    public virtual ICollection<Tag> Tags { get; set; } = new List<Tag>();

    public virtual ICollection<Comment> Comments { get; set; } = new List<Comment>();

    public DateTime CreatedAt { get; set; }
}
