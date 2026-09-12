#nullable enable

namespace Example.Models;

public partial class OrderItem
{
    public long Id { get; set; }

    public long OrderId { get; set; }

    public virtual Order Order { get; set; } = null!;

    public string Sku { get; set; } = null!;

    public int Qty { get; set; } = 1;

    public decimal Price { get; set; }
}
