<?php

namespace App\Models;

/**
 * Members named after words of PHP: `class` is the one a case cannot take.
 */
enum Kind: string
{
    case CLASS_ = 'CLASS';
    case STATIC = 'STATIC';
}