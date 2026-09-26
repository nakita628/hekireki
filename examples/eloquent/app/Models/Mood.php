<?php

namespace App\Models;

/**
 * Values PHP has to quote: an apostrophe and a backslash.
 */
enum Mood: string
{
    case FINE = 'it\'s fine';
    case SO_SO = 'so-so';
    case ESCAPED = 'back\\slash';
}