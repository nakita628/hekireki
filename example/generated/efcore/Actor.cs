#nullable enable

using System.Collections.Generic;

namespace Example.Models;

/// <summary>
/// Named implicit many-to-many: the join table is `_cast`,
/// not `_ActorToFilm`.
/// </summary>
public partial class Actor
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;

    public virtual ICollection<Film> Films { get; set; } = new List<Film>();
}
