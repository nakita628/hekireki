#nullable enable

using System;
using System.Collections.Generic;

namespace Example.Models;

public partial class Order
{
    public long Id { get; set; }

    public string UserId { get; set; } = null!;

    public virtual User User { get; set; } = null!;

    public decimal Total { get; set; }

    public DateTime PlacedAt { get; set; }

    public virtual ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
}
