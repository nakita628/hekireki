<?php

namespace App\Models;

enum Visibility: string
{
    case PUBLIC = 'public';
    case PRIVATE = 'private';
    case LINK_ONLY = 'link_only';
}