<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CronLog;
use Illuminate\Http\Request;

class CronLogController extends Controller
{
    public function index(Request $request)
    {
        $logs = CronLog::orderBy('run_time', 'desc')->paginate(50);
        
        if ($request->ajax()) {
            return response()->json([
                'html' => view('admin.cron_logs.partials.table', compact('logs'))->render(),
                'last_updated' => now()->format('H:i:s')
            ]);
        }
        
        return view('admin.cron_logs.index', compact('logs'));
    }

    public function destroyAll()
    {
        CronLog::truncate();
        return redirect()->back()->with('success', 'All logs cleared successfully.');
    }
}
