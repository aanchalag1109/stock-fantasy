<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Auto price fetch: session live hone pe start prices, complete hone pe end prices
Schedule::command('league:update-status')->everyMinute();
Schedule::command('contest:update-live-scores')->everyFiveMinutes();
Schedule::command('contest:calculate-performance')->everyFiveMinutes();
