<?php

namespace App\Models;

enum Kind: string
{
    case CLASS_ = 'CLASS';
    case STATIC = 'STATIC';
}