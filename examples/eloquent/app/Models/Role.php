<?php

namespace App\Models;

/**
 * Stored under names of their own, which is what the database holds and what a backed enum's
 * value has to be.
 */
enum Role: string
{
    case CUSTOMER = 'customer';
    case STAFF = 'staff';
    case ADMIN = 'ADMIN';
}