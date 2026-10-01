<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use App\Models\CronLog;

class CronController extends Controller
{
    /**
     * Trigger the Laravel task scheduler.
     * This can be called from a web browser or a service like cron-job.org
     */
    public function run(Request $request)
    {
        // Simple security check (Optional: add a secret key in query)
        // Example: /run-cron?key=your_secret_key
        $secret = 'probtrade_cron_2026'; // You can change this
        
        if ($request->query('key') !== $secret) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthorized access. Secret key required.'
            ], 401);
        }

        try {
            // Run the scheduler
            Artisan::call('schedule:run');
            $output = Artisan::output();

            // Store Log
            CronLog::create([
                'run_time' => now(),
                'status' => 'success',
                'output' => $output,
                'type' => 'manual-web'
            ]);

            // Update heartbeat manually just in case
            Cache::put('cron_last_run', now());

            return response()->json([
                'success' => true,
                'message' => 'Scheduler executed successfully.',
                'output' => $output,
                'time' => now()->toDateTimeString()
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error running scheduler: ' . $e->getMessage()
            ], 500);
        }
    }
}
