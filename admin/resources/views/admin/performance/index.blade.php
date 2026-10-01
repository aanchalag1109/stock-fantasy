@extends('admin.layouts.app')

@section('title', 'Performance - Sessions')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-graph-up-arrow text-primary me-2"></i>Performance - Sessions</h1>
            <p class="text-muted mb-0">Monitor and analyze session performance metrics</p>
        </div>
        <div>
            <select id="statusFilter" class="form-select">
                <option value="all">All Sessions</option>
                <option value="live">🔴 Live</option>
                <option value="upcoming">⏰ Upcoming</option>
                <option value="completed">✅ Completed</option>
            </select>
        </div>
    </div>

    <div class="card shadow-sm border-0">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0" id="sessionsTable">
                    <thead class="table-light">
                        <tr>
                            <th class="text-center">#</th>
                            <th><i class="bi bi-tag me-1"></i>Session Name</th>
                            <th class="text-center"><i class="bi bi-graph-up me-1"></i>Market</th>
                            <th class="text-center"><i class="bi bi-circle-fill me-1"></i>Status</th>
                            <th class="text-center"><i class="bi bi-play-circle me-1"></i>Start Time</th>
                            <th class="text-center"><i class="bi bi-stop-circle me-1"></i>End Time</th>
                            <th class="text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($sessions as $session)
                        <tr data-status="{{ $session->status }}" class="session-row">
                            <td class="text-center fw-bold text-primary">{{ $session->id }}</td>
                            <td class="fw-semibold">{{ $session->name }}</td>
                            <td class="text-center">
                                <span class="badge bg-dark">
                                    <i class="bi bi-{{ $session->market_type === 'crypto' ? 'currency-bitcoin' : 'graph-up' }} me-1"></i>
                                    {{ ucfirst($session->market_type ?? 'stock') }}
                                </span>
                            </td>
                            <td class="text-center">
                                @if($session->status === 'live')
                                    <span class="badge bg-success pulse">
                                        <i class="bi bi-broadcast me-1"></i>Live
                                    </span>
                                @elseif($session->status === 'upcoming')
                                    <span class="badge bg-info">
                                        <i class="bi bi-clock me-1"></i>Upcoming
                                    </span>
                                @elseif($session->status === 'completed')
                                    <span class="badge bg-secondary">
                                        <i class="bi bi-check-circle me-1"></i>Completed
                                    </span>
                                @else
                                    <span class="badge bg-light text-dark">
                                        {{ ucfirst($session->status) }}
                                    </span>
                                @endif
                            </td>
                            <td class="text-center text-muted">
                                <small>{{ \Carbon\Carbon::parse($session->start_time)->format('M d, Y') }}</small><br>
                                <strong>{{ \Carbon\Carbon::parse($session->start_time)->format('H:i') }}</strong>
                            </td>
                            <td class="text-center text-muted">
                                <small>{{ \Carbon\Carbon::parse($session->end_time)->format('M d, Y') }}</small><br>
                                <strong>{{ \Carbon\Carbon::parse($session->end_time)->format('H:i') }}</strong>
                            </td>
                            <td class="text-center">
                                <a href="{{ route('admin.performance.session.detail', $session->id) }}" 
                                   class="btn btn-primary btn-sm" target="_blank">
                                    <i class="bi bi-eye me-1"></i>View Details
                                </a>
                            </td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<style>
.pulse {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.7; }
    100% { opacity: 1; }
}

.session-row:hover {
    background-color: #f8f9fa;
    transform: translateY(-1px);
    transition: all 0.2s ease;
}

.card {
    border-radius: 15px;
}

.table th {
    font-weight: 600;
    border: none;
}

.table td {
    vertical-align: middle;
}

.btn {
    border-radius: 8px;
    font-weight: 500;
}

.badge {
    padding: 0.5em 0.8em;
    font-weight: 500;
}
</style>

<script>
document.getElementById('statusFilter').addEventListener('change', function() {
    const filterValue = this.value;
    const rows = document.querySelectorAll('#sessionsTable tbody tr');
    
    rows.forEach(row => {
        const status = row.getAttribute('data-status');
        if (filterValue === 'all' || status === filterValue) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});
</script>
@endsection