<?php

namespace App\Models;

/**
 * User role. No @map: the value names are stored verbatim.
 */
enum Role: string
{
    case ADMIN = 'ADMIN';
    case EDITOR = 'EDITOR';
    case VIEWER = 'VIEWER';
}