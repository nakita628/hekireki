<?php

namespace App\Models;

enum Role: string
{
    case ADMIN = 'ADMIN';
    case EDITOR = 'EDITOR';
    case VIEWER = 'VIEWER';
}