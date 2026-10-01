<?php

namespace App\Http\Controllers;

use App\Models\CronJob;
use Illuminate\Http\Request;

class CronJobController extends Controller
{
    public function index()
    {
        $cronJobs = CronJob::latest()->get();
        return view('admin.cron.index', compact('cronJobs'));
    }

    public function create()
    {
        return view('admin.cron.create');
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        CronJob::create($data + ['is_active' => true]);
        return redirect()->route('admin.cron.index')->with('success', 'Cron job created successfully.');
    }

    public function edit(CronJob $cron)
    {
        return view('admin.cron.edit', compact('cron'));
    }

    public function update(Request $request, CronJob $cron)
    {
        $cron->update($this->validated($request));
        return redirect()->route('admin.cron.index')->with('success', 'Cron job updated successfully.');
    }

    public function destroy(CronJob $cron)
    {
        $cron->delete();
        return redirect()->route('admin.cron.index')->with('success', 'Cron job deleted.');
    }

    public function toggle(CronJob $cron)
    {
        $cron->update(['is_active' => !$cron->is_active]);
        return redirect()->route('admin.cron.index')->with('success', 'Status updated.');
    }

    private function validated(Request $request): array
    {
        $rules = [
            'name'        => 'required|string|max:255',
            'type'        => 'required|in:artisan,api',
            'schedule'    => 'required|string|max:100',
            'description' => 'nullable|string',
        ];

        if ($request->type === 'api') {
            $rules['api_url']     = 'required|url';
            $rules['api_method']  = 'required|in:GET,POST,PUT,PATCH,DELETE';
            $rules['api_headers'] = 'nullable|string';
            $rules['api_body']    = 'nullable|string';
        } else {
            $rules['command'] = 'required|string|max:255';
        }

        return $request->validate($rules);
    }
}
