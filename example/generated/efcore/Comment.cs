#nullable enable

using System;

namespace Example.Models;

public partial class Comment
{
    public int Id { get; set; }

    public string Body { get; set; } = null!;

    public string PostId { get; set; } = null!;

    public virtual Post Post { get; set; } = null!;

    public string? AuthorId { get; set; }

    public virtual User? Author { get; set; }

    public DateTime CreatedAt { get; set; }
}
