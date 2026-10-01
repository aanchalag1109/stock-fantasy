<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class UpdateContestStatus extends Command
{
    protected $signature = 'contest:update-status {contest_id} {status}';
    protected $description = 'Update contest status manually';

    public function handle()
    {
        $contestId = $this->argument('contest_id');
        $status = $this->argument('status');
        
        if (!in_array($status, ['upcoming', 'live', 'completed'])) {
            $this->error("Invalid status! Use: upcoming, live, or completed");
            return 1;
        }
        
        $updated = DB::table('contests')
            ->where('id', $contestId)
            ->update(['status' => $status]);
        
        if ($updated) {
            $this->info("✅ Contest {$contestId} status updated to: {$status}");
        } else {
            $this->error("❌ Contest {$contestId} not found!");
        }
        
        return 0;
    }
}
