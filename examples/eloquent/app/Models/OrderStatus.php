<?php

namespace App\Models;

/**
 * No member is mapped: each case's value is its name.
 */
enum OrderStatus: string
{
    case PENDING = 'PENDING';
    case PAID = 'PAID';
    case SHIPPED = 'SHIPPED';
    case CANCELLED = 'CANCELLED';
}