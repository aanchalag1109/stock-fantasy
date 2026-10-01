<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    protected $commands = [
        Commands\StartContest::class,
        Commands\UpdateScores::class,
        Commands\UpdateLeagueSessionStatus::class,
        Commands\CalculateContestPerformance::class,
        Commands\UpdateLiveScores::class,
    ];

    protected function schedule(Schedule $schedule)
    {
        // Cron heart-beat to monitor status
        $schedule->call(function () {
            \Illuminate\Support\Facades\Cache::put('cron_last_run', now());
        })->everyMinute();

        // Session status updates (every 30 seconds for faster response)
        $schedule->command('league:update-status')->everyThirtySeconds();
        
        // Live score updates (every 15 minutes for live sessions)
        $schedule->command('contest:update-live-scores')->everyFifteenMinutes();
        
        // Final calculation (every 2 minutes for completed sessions)
        $schedule->command('contest:calculate-performance')->everyTwoMinutes();
    }

    protected function commands()
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}