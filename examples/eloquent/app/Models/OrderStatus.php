<?php

namespace App\Models;

enum OrderStatus: string
{
    case PENDING = 'PENDING';
    case PAID = 'PAID';
    case SHIPPED = 'SHIPPED';
    case CANCELLED = 'CANCELLED';
}