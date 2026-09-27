<?php

namespace App\Models;

enum Role: string
{
    case CUSTOMER = 'customer';
    case STAFF = 'staff';
    case ADMIN = 'ADMIN';
}