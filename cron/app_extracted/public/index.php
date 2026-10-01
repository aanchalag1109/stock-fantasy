<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
|--------------------------------------------------------------------------
| cPanel Deployment Note
|--------------------------------------------------------------------------
| Agar cPanel pe deploy kar rahe ho aur project public_html ke bahar hai
| (e.g. /home/username/cron_app/) to neeche ke paths change karo:
|
|   __DIR__.'/../storage/...'   →  __DIR__.'/../cron_app/storage/...'
|   __DIR__.'/../vendor/...'    →  __DIR__.'/../cron_app/vendor/...'
|   __DIR__.'/../bootstrap/...' →  __DIR__.'/../cron_app/bootstrap/...'
|
| Detail ke liye: CPANEL_DEPLOY.md dekho
*/

if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/../vendor/autoload.php';

/** @var Application $app */
$app = require_once __DIR__.'/../bootstrap/app.php';

$app->handleRequest(Request::capture());
