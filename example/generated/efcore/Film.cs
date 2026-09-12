#nullable enable

using System.Collections.Generic;

namespace Example.Models;

public partial class Film
{
    public int Id { get; set; }

    public string Title { get; set; } = null!;

    public virtual ICollection<Actor> Actors { get; set; } = new List<Actor>();
}
