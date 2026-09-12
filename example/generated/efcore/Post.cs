#nullable enable

using System;
using System.Collections.Generic;

namespace Example.Models;

public partial class Post
{
    public string Id { get; set; } = null!;

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
