<div class="space-y-4">
    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input type="text" name="name" value="{{ old('name', $cron->name ?? '') }}" required
            placeholder="e.g. Send Daily Report"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
        <select name="type" id="jobType" onchange="toggleType()"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="artisan" {{ old('type', $cron->type ?? 'artisan') === 'artisan' ? 'selected' : '' }}>Artisan Command</option>
            <option value="api"     {{ old('type', $cron->type ?? '') === 'api' ? 'selected' : '' }}>API Call</option>
        </select>
    </div>

    {{-- Artisan fields --}}
    <div id="artisanFields">
        <label class="block text-sm font-medium text-gray-700 mb-1">Artisan Command</label>
        <input type="text" name="command" value="{{ old('command', $cron->command ?? '') }}"
            placeholder="e.g. emails:send-daily"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500">
    </div>

    {{-- API fields --}}
    <div id="apiFields" class="space-y-4" style="display:none">
        <div class="grid grid-cols-3 gap-3">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">Method</label>
                <select name="api_method"
                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    @foreach(['GET','POST','PUT','PATCH','DELETE'] as $m)
                        <option value="{{ $m }}" {{ old('api_method', $cron->api_method ?? 'GET') === $m ? 'selected' : '' }}>{{ $m }}</option>
                    @endforeach
                </select>
            </div>
            <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-1">API URL</label>
                <input type="url" name="api_url" value="{{ old('api_url', $cron->api_url ?? '') }}"
                    placeholder="https://example.com/api/endpoint"
                    class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
                Headers <span class="text-gray-400 font-normal">(JSON)</span>
            </label>
            <textarea name="api_headers" rows="3"
                placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500">{{ old('api_headers', $cron->api_headers ?? '') }}</textarea>
        </div>

        <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
                Request Body <span class="text-gray-400 font-normal">(JSON, for POST/PUT/PATCH)</span>
            </label>
            <textarea name="api_body" rows="3"
                placeholder='{"key": "value"}'
                class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500">{{ old('api_body', $cron->api_body ?? '') }}</textarea>
        </div>
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Cron Schedule Expression</label>

        <select id="schedulePreset" onchange="applyPreset()"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2">
            <option value="">— Select a preset —</option>
            <optgroup label="Every">
                <option value="* * * * *">Every Minute</option>
                <option value="*/5 * * * *">Every 5 Minutes</option>
                <option value="*/10 * * * *">Every 10 Minutes</option>
                <option value="*/15 * * * *">Every 15 Minutes</option>
                <option value="*/30 * * * *">Every 30 Minutes</option>
                <option value="0 * * * *">Every Hour</option>
                <option value="0 */2 * * *">Every 2 Hours</option>
                <option value="0 */6 * * *">Every 6 Hours</option>
                <option value="0 */12 * * *">Every 12 Hours</option>
            </optgroup>
            <optgroup label="Daily">
                <option value="0 0 * * *">Every Day at Midnight</option>
                <option value="0 6 * * *">Every Day at 6:00 AM</option>
                <option value="0 8 * * *">Every Day at 8:00 AM</option>
                <option value="0 12 * * *">Every Day at 12:00 PM</option>
                <option value="0 18 * * *">Every Day at 6:00 PM</option>
                <option value="0 23 * * *">Every Day at 11:00 PM</option>
            </optgroup>
            <optgroup label="Weekly">
                <option value="0 0 * * 0">Every Sunday at Midnight</option>
                <option value="0 0 * * 1">Every Monday at Midnight</option>
                <option value="0 8 * * 1">Every Monday at 8:00 AM</option>
                <option value="0 0 * * 5">Every Friday at Midnight</option>
                <option value="0 0 * * 6">Every Saturday at Midnight</option>
            </optgroup>
            <optgroup label="Monthly">
                <option value="0 0 1 * *">1st of Every Month</option>
                <option value="0 0 15 * *">15th of Every Month</option>
                <option value="0 0 L * *">Last Day of Every Month</option>
            </optgroup>
            <optgroup label="Yearly">
                <option value="0 0 1 1 *">Every Year on Jan 1st</option>
            </optgroup>
            <option value="custom">Custom...</option>
        </select>

        <input type="text" name="schedule" id="scheduleInput"
            value="{{ old('schedule', $cron->schedule ?? '') }}" required
            placeholder="* * * * *"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500">
        <p class="text-xs text-gray-400 mt-1">Format: <code>minute hour day month weekday</code></p>
    </div>

    <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Description <span class="text-gray-400">(optional)</span></label>
        <textarea name="description" rows="2"
            placeholder="What does this cron job do?"
            class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">{{ old('description', $cron->description ?? '') }}</textarea>
    </div>
</div>

<script>
function toggleType() {
    const type = document.getElementById('jobType').value;
    document.getElementById('artisanFields').style.display = type === 'artisan' ? 'block' : 'none';
    document.getElementById('apiFields').style.display     = type === 'api'     ? 'block' : 'none';
}

function applyPreset() {
    const preset = document.getElementById('schedulePreset').value;
    if (preset && preset !== 'custom') {
        document.getElementById('scheduleInput').value = preset;
    }
}

// On load: sync dropdown to current value
document.addEventListener('DOMContentLoaded', function () {
    toggleType();
    const current = document.getElementById('scheduleInput').value;
    const options = document.getElementById('schedulePreset').options;
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === current) {
            options[i].selected = true;
            return;
        }
    }
    // not found in presets — select Custom
    if (current) {
        document.getElementById('schedulePreset').value = 'custom';
    }
});
</script>
