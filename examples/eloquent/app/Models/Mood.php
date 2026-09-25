<?php

namespace App\Models;

enum Mood: string
{
    case FINE = 'it\'s fine';
    case SO_SO = 'so-so';
    case ESCAPED = 'back\\slash';
}