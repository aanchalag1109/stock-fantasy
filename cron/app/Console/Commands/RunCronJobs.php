<?php

namespace App\Console\Commands;

use App\Models\CronJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Dragonmantank\CronExpression\CronExpression;

class RunCronJobs extends Command
{
    protected $signature   = 'cron:run';
    protected $description = 'Run all active scheduled cron jobs';

    public function handle(): void
    {
        $jobs = CronJob::where('is_active', true)->get();

        foreach ($jobs as $job) {
            if (!$this->isDue($job->schedule)) {
                continue;
            }

            $this->info("Running: {$job->name}");

            if ($job->type === 'api') {
                $this->runApiJob($job);
            } else {
                $this->runArtisanJob($job);
            }
        }

        $this->info('Cron run complete.');
    }

    private function isDue(string $expression): bool
    {
        try {
            return (new CronExpression($expression))->isDue();
        } catch (\Exception) {
            return false;
        }
    }

    private function runApiJob(CronJob $job): void
    {
        try {
            $headers = $job->api_headers ? json_decode($job->api_headers, true) : [];
            $body    = $job->api_body    ? json_decode($job->api_body, true)    : [];

            $response = Http::withHeaders($headers ?? [])
                ->{strtolower($job->api_method)}($job->api_url, $body ?: []);

            $job->update([
                'last_run_at'   => now(),
                'last_success'  => $response->successful(),
                'last_response' => substr($response->body(), 0, 1000),
            ]);

            $this->info("  → {$response->status()} " . ($response->successful() ? 'OK' : 'FAILED'));
        } catch (\Exception $e) {
            $job->update([
                'last_run_at'   => now(),
                'last_success'  => false,
                'last_response' => $e->getMessage(),
            ]);
            $this->error("  → Error: {$e->getMessage()}");
        }
    }

    private function runArtisanJob(CronJob $job): void
    {
        try {
            \Artisan::call($job->command);
            $output = \Artisan::output();

            $job->update([
                'last_run_at'   => now(),
                'last_success'  => true,
                'last_response' => substr($output, 0, 1000),
            ]);
        } catch (\Exception $e) {
            $job->update([
                'last_run_at'   => now(),
                'last_success'  => false,
                'last_response' => $e->getMessage(),
            ]);
            $this->error("  → Error: {$e->getMessage()}");
        }
    }
}
