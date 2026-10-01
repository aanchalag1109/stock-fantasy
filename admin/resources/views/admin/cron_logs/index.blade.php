@extends('admin.layouts.app')

@section('title', 'Cron Check Logs')

@section('head')
<style>
    .fade-in-row {
        animation: fadeIn 0.5s ease-in;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .update-pulse {
        animation: pulse-animation 2s infinite;
    }
    @keyframes pulse-animation {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>
@endsection

@section('content')
<div class="container-fluid py-4">
    <div class="row mb-4">
        <div class="col-md-6">
            <h4 class="mb-0">
                <i class="bi bi-clock-history me-2"></i>Cron Check Logs
                <span id="updateIndicator" class="ms-2 badge bg-success d-none" style="font-size: 0.6rem;">Updating...</span>
            </h4>
            <p class="text-muted small">
                Live Status: <span id="lastUpdated" class="fw-bold text-dark">{{ now()->format('H:i:s') }}</span>
                <span class="ms-2 text-info update-pulse small"><i class="bi bi-broadcast"></i> Auto-refreshing via AJAX</span>
            </p>
        </div>
        <div class="col-md-6 text-end">
            <div class="d-flex justify-content-end gap-2">
                <button onclick="fetchLogs()" class="btn btn-outline-primary btn-sm">
                    <i class="bi bi-arrow-clockwise me-1"></i>Refresh Now
                </button>
                <form action="{{ route('admin.cron-logs.clear') }}" method="POST" onsubmit="return confirm('Are you sure you want to clear all logs?');">
                    @csrf
                    @method('DELETE')
                    <button type="submit" class="btn btn-danger btn-sm">
                        <i class="bi bi-trash me-2"></i>Clear All Logs
                    </button>
                </form>
            </div>
        </div>
    </div>

    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th class="ps-4">Run Time</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Output</th>
                            <th class="pe-4 text-end">Diff</th>
                        </tr>
                    </thead>
                    <tbody id="logsTableBody">
                        @include('admin.cron_logs.partials.table', ['logs' => $logs])
                    </tbody>
                </table>
            </div>
        </div>
        <div class="card-footer bg-white border-0 py-3" id="pagination-container">
            {{ $logs->links() }}
        </div>
    </div>
</div>
@endsection

@section('scripts')
<script>
    function fetchLogs() {
        const indicator = document.getElementById('updateIndicator');
        const lastUpdatedText = document.getElementById('lastUpdated');
        const tableBody = document.getElementById('logsTableBody');
        
        indicator.classList.remove('d-none');
        
        fetch(window.location.href, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        })
        .then(response => response.json())
        .then(data => {
            tableBody.innerHTML = data.html;
            lastUpdatedText.textContent = data.last_updated;
            
            // Subtle flash effect on update
            indicator.textContent = 'Updated!';
            setTimeout(() => {
                indicator.classList.add('d-none');
                indicator.textContent = 'Updating...';
            }, 2000);
        })
        .catch(error => {
            console.error('Error fetching logs:', error);
            indicator.textContent = 'Update Failed';
            indicator.classList.replace('bg-success', 'bg-danger');
            setTimeout(() => {
                indicator.classList.add('d-none');
                indicator.classList.replace('bg-danger', 'bg-success');
                indicator.textContent = 'Updating...';
            }, 3000);
        });
    }

    // Auto-refresh every 20 seconds for a smoother feel
    setInterval(fetchLogs, 20000);
</script>
@endsection
