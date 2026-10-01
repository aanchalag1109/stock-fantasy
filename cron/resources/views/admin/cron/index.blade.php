@extends('admin.layout')
@section('title', 'Cron Jobs')

@section('content')
<div class="flex justify-between items-center mb-6">
    <p class="text-sm text-gray-500">Manage all scheduled cron jobs</p>
    <a href="{{ route('admin.cron.create') }}"
       class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition">
        + Add Cron Job
    </a>
</div>

<div class="bg-white rounded-lg shadow overflow-hidden">
    <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
                <th class="px-4 py-3 text-left">#</th>
                <th class="px-4 py-3 text-left">Name</th>
                <th class="px-4 py-3 text-left">Type / Command</th>
                <th class="px-4 py-3 text-left">Schedule</th>
                <th class="px-4 py-3 text-left">Last Run</th>
                <th class="px-4 py-3 text-left">Last Result</th>
                <th class="px-4 py-3 text-left">Status</th>
                <th class="px-4 py-3 text-left">Actions</th>
            </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
            @forelse($cronJobs as $cron)
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-gray-400">{{ $cron->id }}</td>
                <td class="px-4 py-3">
                    <p class="font-medium text-gray-800">{{ $cron->name }}</p>
                    @if($cron->description)
                        <p class="text-xs text-gray-400">{{ Str::limit($cron->description, 50) }}</p>
                    @endif
                </td>
                <td class="px-4 py-3">
                    @if($cron->type === 'api')
                        <span class="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded font-medium">API</span>
                        <p class="text-xs text-gray-500 mt-1 font-mono truncate max-w-[180px]">
                            <span class="font-bold">{{ $cron->api_method }}</span> {{ $cron->api_url }}
                        </p>
                    @else
                        <span class="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded font-medium">Artisan</span>
                        <p class="text-xs font-mono text-gray-500 mt-1">{{ $cron->command }}</p>
                    @endif
                </td>
                <td class="px-4 py-3">
                    <code class="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">{{ $cron->schedule }}</code>
                </td>
                <td class="px-4 py-3 text-gray-500 text-xs">
                    {{ $cron->last_run_at ? $cron->last_run_at->diffForHumans() : 'Never' }}
                </td>
                <td class="px-4 py-3">
                    @if($cron->last_run_at)
                        @if($cron->last_success)
                            <span class="text-green-600 text-xs font-medium">✓ Success</span>
                        @else
                            <span class="text-red-500 text-xs font-medium" title="{{ $cron->last_response }}">✗ Failed</span>
                        @endif
                        @if($cron->last_response)
                            <p class="text-xs text-gray-400 truncate max-w-[150px]" title="{{ $cron->last_response }}">
                                {{ Str::limit($cron->last_response, 40) }}
                            </p>
                        @endif
                    @else
                        <span class="text-gray-300 text-xs">—</span>
                    @endif
                </td>
                <td class="px-4 py-3">
                    <form method="POST" action="{{ route('admin.cron.toggle', $cron) }}">
                        @csrf
                        <button type="submit"
                            class="px-2 py-1 rounded text-xs font-medium {{ $cron->is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-red-100 text-red-600 hover:bg-red-200' }}">
                            {{ $cron->is_active ? 'Active' : 'Inactive' }}
                        </button>
                    </form>
                </td>
                <td class="px-4 py-3 flex items-center gap-2">
                    <a href="{{ route('admin.cron.edit', $cron) }}"
                       class="text-blue-600 hover:underline text-xs">Edit</a>
                    <form method="POST" action="{{ route('admin.cron.destroy', $cron) }}"
                          onsubmit="return confirm('Delete this cron job?')">
                        @csrf @method('DELETE')
                        <button class="text-red-500 hover:underline text-xs">Delete</button>
                    </form>
                </td>
            </tr>
            @empty
            <tr>
                <td colspan="8" class="px-4 py-8 text-center text-gray-400">
                    No cron jobs found. <a href="{{ route('admin.cron.create') }}" class="text-blue-500 hover:underline">Add one</a>.
                </td>
            </tr>
            @endforelse
        </tbody>
    </table>
</div>
@endsection
