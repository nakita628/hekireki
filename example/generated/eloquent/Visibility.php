<?php

namespace App\Models;

/**
 * Enum with @map on every value and @@map on the enum itself:
 * the database stores the mapped values ("link_only"), while
 * generators receive the Prisma-level names ("LINK_ONLY").
 */
enum Visibility: string
{
    case PUBLIC = 'public';
    case PRIVATE = 'private';
    case LINK_ONLY = 'link_only';
}