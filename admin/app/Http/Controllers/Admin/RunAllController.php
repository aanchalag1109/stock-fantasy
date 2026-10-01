<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\RunAllJob;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class RunAllController extends Controller
{
    public function runAll(Request $request, $contestId)
    {
        // Get session times from DB directly
        $contest = DB::table('contests')
            ->leftJoin('league_sessions', 'contests.league_session_id', '=', 'league_sessions.id')
            ->select('contests.*', 'league_sessions.start_time', 'league_sessions.end_time', 'league_sessions.market_type')
            ->where('contests.id', $contestId)
            ->first();

        if (!$contest) {
            return response()->json(['success' => false, 'message' => 'Contest not found'], 404);
        }

        $startTime = $request->input('start_time');
        $endTime   = $request->input('end_time');

        if (!$startTime || !$endTime) {
            return response()->json(['success' => false, 'message' => 'Start time aur End time fields mein time likho'], 422);
        }

        $today     = now()->format('Y-m-d');
        $startTime = Carbon::parse($today . ' ' . $startTime);
        $endTime   = Carbon::parse($today . ' ' . $endTime);

        if ($endTime->lte($startTime)) {
            return response()->json(['success' => false, 'message' => 'End time start time se baad honi chahiye'], 422);
        }

        $logKey = 'run_all_log_' . $contestId;
        Cache::put($logKey, [
            'status' => 'queued',
            'log'    => [
                'Job queued!',
                'Start: ' . $startTime->format('H:i:s'),
                'End: '   . $endTime->format('H:i:s'),
            ]
        ], 7200);

        RunAllJob::dispatch((int)$contestId, $startTime->format('H:i:s'), $endTime->format('H:i:s'));

        return response()->json([
            'success'  => true,
            'message'  => 'Job queued!',
            'start'    => $startTime->format('H:i:s'),
            'end'      => $endTime->format('H:i:s'),
            'poll_url' => url('admin/api/run-all-log/' . $contestId),
        ]);
    }

    public function getLog($contestId)
    {
        $logKey = 'run_all_log_' . $contestId;
        return response()->json(Cache::get($logKey, ['status' => 'not_started', 'log' => []]));
    }

    public function stopJob($contestId)
    {
        $logKey = 'run_all_log_' . $contestId;
        $data   = Cache::get($logKey, []);
        $data['status'] = 'failed';
        $data['log'][]  = 'Job manually stopped by admin.';
        Cache::put($logKey, $data, 3600);

        // Delete pending jobs for this contest from queue
        \DB::table('jobs')->where('payload', 'like', '%"contestId":' . $contestId . '%')->delete();

        return response()->json(['success' => true, 'message' => 'Job stopped']);
    }
}
