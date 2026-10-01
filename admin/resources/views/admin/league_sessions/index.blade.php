@extends('admin.layouts.app')
@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-0"><i class="bi bi-calendar2-week me-2"></i>Leagues & Sessions</h1>
            <small class="text-muted">Current Time (IST): <span id="current-time">{{ now('Asia/Kolkata')->format('M j, Y H:i:s') }}</span></small>
        </div>
        <div>
            <button onclick="bulkDelete()" class="btn btn-outline-danger me-2" id="bulkDeleteBtn" style="display:none;">
                <i class="bi bi-trash me-1"></i>Delete Selected
            </button>
            <a href="{{ route('admin.league_sessions.create') }}" class="btn btn-primary">
                <i class="bi bi-plus-circle me-1"></i>Create New Session
            </a>
        </div>
    </div>

    <div class="card shadow-sm mb-4">
        <div class="card-body">
            <div class="btn-group" role="group">
                <a href="?status=live" class="btn {{ $status == 'live' ? 'btn-success' : 'btn-outline-success' }}">
                    <i class="bi bi-broadcast me-1"></i>Live
                </a>
                <a href="?status=upcoming" class="btn {{ $status == 'upcoming' ? 'btn-info' : 'btn-outline-info' }}">
                    <i class="bi bi-clock me-1"></i>Upcoming
                </a>
                <a href="?status=completed" class="btn {{ $status == 'completed' ? 'btn-warning' : 'btn-outline-warning' }}">
                    <i class="bi bi-check-circle me-1"></i>Completed
                </a>
                <a href="?status=draft" class="btn {{ $status == 'draft' ? 'btn-secondary' : 'btn-outline-secondary' }}">
                    <i class="bi bi-file-earmark me-1"></i>Draft
                </a>
                <a href="{{ route('admin.league_sessions.index') }}" class="btn {{ !$status ? 'btn-dark' : 'btn-outline-dark' }}">
                    <i class="bi bi-list me-1"></i>All
                </a>
            </div>
        </div>
    </div>

    <div class="card shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th class="fw-semibold"><input type="checkbox" id="selectAll"></th>
                            <th class="fw-semibold"><i class="bi bi-image me-1"></i>Image</th>
                            <th class="fw-semibold"><i class="bi bi-tag me-1"></i>Session Name</th>
                            <th class="fw-semibold"><i class="bi bi-graph-up me-1"></i>Market</th>
                            <th class="fw-semibold"><i class="bi bi-collection me-1"></i>Max Stocks</th>
                            <th class="fw-semibold"><i class="bi bi-calendar-event me-1"></i>Schedule</th>
                            <th class="fw-semibold"><i class="bi bi-door-open me-1"></i>Registration</th>
                            <th class="fw-semibold"><i class="bi bi-circle-fill me-1"></i>Status</th>
                            <th class="fw-semibold"><i class="bi bi-toggles me-1"></i>Active</th>
                            <th class="fw-semibold text-center"><i class="bi bi-gear me-1"></i>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($sessions as $session)
                        <tr>
                            <td>
                                @if($session->status !== 'live' || !$session->active)
                                    <input type="checkbox" class="session-checkbox" value="{{ $session->id }}">
                                @endif
                            </td>
                            <td>
                                @if($session->image_url)
                                    <img src="{{ asset($session->image_url) }}" alt="{{ $session->name }}" class="rounded" style="width: 50px; height: 50px; object-fit: cover;">
                                @else
                                    <div class="bg-light rounded d-flex align-items-center justify-content-center" style="width: 50px; height: 50px;">
                                        <i class="bi bi-image text-muted"></i>
                                    </div>
                                @endif
                            </td>
                            <td>
                                <div class="fw-semibold text-dark">{{ $session->name }}</div>
                            </td>
                            <td>
                                <span class="badge {{ $session->market_type == 'stock' ? 'bg-primary' : 'bg-warning' }}">
                                    <i class="bi bi-{{ $session->market_type == 'stock' ? 'graph-up' : 'currency-bitcoin' }} me-1"></i>
                                    {{ ucfirst($session->market_type) }}
                                </span>
                            </td>
                            <td><span class="badge bg-light text-dark">{{ $session->max_stocks }}</span></td>
                            <td>
                                <div class="small">
                                    <div><i class="bi bi-play-circle text-success me-1"></i>{{ date('M j, Y H:i', strtotime($session->start_time)) }}</div>
                                    <div><i class="bi bi-stop-circle text-danger me-1"></i>{{ date('M j, Y H:i', strtotime($session->end_time)) }}</div>
                                </div>
                            </td>
                            <td>
                                <div class="small">
                                    @if($session->user_joining_start_time)
                                        <div><i class="bi bi-door-open text-info me-1"></i>{{ date('M j, Y H:i', strtotime($session->user_joining_start_time)) }}</div>
                                    @else
                                        <div class="text-muted"><i class="bi bi-dash me-1"></i>Not Set</div>
                                    @endif
                                </div>
                            </td>
                            <td>
                                @php
                                    $statusColors = [
                                        'live' => 'success',
                                        'upcoming' => 'info', 
                                        'completed' => 'warning',
                                        'draft' => 'secondary'
                                    ];
                                    $statusIcons = [
                                        'live' => 'broadcast',
                                        'upcoming' => 'clock',
                                        'completed' => 'check-circle',
                                        'draft' => 'file-earmark'
                                    ];
                                @endphp
                                <span class="badge bg-{{ $statusColors[$session->status] ?? 'secondary' }} status-badge" data-session-id="{{ $session->id }}">
                                    <i class="bi bi-{{ $statusIcons[$session->status] ?? 'circle' }} me-1"></i>
                                    {{ ucfirst($session->status) }}
                                </span>
                            </td>
                            <td>
                                <span class="badge {{ $session->active ? 'bg-success' : 'bg-danger' }}">
                                    <i class="bi bi-{{ $session->active ? 'check' : 'x' }}-circle me-1"></i>
                                    {{ $session->active ? 'Active' : 'Inactive' }}
                                </span>
                            </td>
                            <td class="text-center">
                                <div class="btn-group btn-group-sm">
                                    @if($session->status === 'upcoming')
                                        <a href="{{ route('admin.league_sessions.show', $session) }}" class="btn btn-outline-success" title="View Session">
                                            <i class="bi bi-eye"></i>
                                        </a>
                                    @endif
                                    
                                    @if($session->status === 'completed')
                                        <a href="{{ route('admin.league_sessions.edit', $session) }}" class="btn btn-outline-info" title="View Details">
                                            <i class="bi bi-eye"></i>
                                        </a>
                                    @elseif($session->status === 'live')
                                        <a href="{{ route('admin.league_sessions.show', $session) }}" class="btn btn-outline-success" title="View Live Session">
                                            <i class="bi bi-eye"></i>
                                        </a>
                                        <a href="{{ route('admin.league_sessions.edit', $session) }}" class="btn btn-outline-warning" title="Deactivate Only">
                                            <i class="bi bi-pause-circle"></i>
                                        </a>
                                    @else
                                        <a href="{{ route('admin.league_sessions.edit', $session) }}" class="btn btn-outline-primary" title="Edit Session">
                                            <i class="bi bi-pencil"></i>
                                        </a>
                                    @endif
                                    
                                    @if($session->status !== 'live' || !$session->active)
                                        <form action="{{ route('admin.league_sessions.destroy', $session) }}" method="POST" class="d-inline">
                                            @csrf
                                            @method('DELETE')
                                            <button type="submit" class="btn btn-outline-danger" title="Delete Session" onclick="return confirm('Are you sure you want to delete this session? This action cannot be undone.')">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </form>
                                    @endif
                                </div>
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="10" class="text-center py-5">
                                <div class="text-muted">
                                    <i class="bi bi-inbox display-1 d-block mb-3"></i>
                                    <h5>No sessions found</h5>
                                    <p>Create your first league session to get started.</p>
                                    <a href="{{ route('admin.league_sessions.create') }}" class="btn btn-primary">
                                        <i class="bi bi-plus-circle me-1"></i>Create New Session
                                    </a>
                                </div>
                            </td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
        @if($sessions->hasPages())
        <div class="card-footer bg-light">
            <div class="d-flex justify-content-between align-items-center">
                <div class="text-muted small">
                    Showing {{ $sessions->firstItem() }} to {{ $sessions->lastItem() }} of {{ $sessions->total() }} sessions
                </div>
                <div>
                    {{ $sessions->appends(request()->query())->links('pagination::bootstrap-4') }}
                </div>
            </div>
        </div>
        @endif
    </div>
</div>

<script>
function updateStatuses() {
    const btn = event.target;
    const icon = btn.querySelector('i');
    icon.classList.add('spin');
    
    fetch('{{ route("admin.league_sessions.update_status") }}', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}',
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        updateSessionsDisplay(data.all_sessions);
        if (data.updated_to_live > 0 || data.updated_to_completed > 0) {
            showToast(`Updated: ${data.updated_to_live} to live, ${data.updated_to_completed} to completed`);
        }
    })
    .finally(() => {
        icon.classList.remove('spin');
    });
}

function testUpdate() {
    fetch('{{ route("admin.league_sessions.test_update") }}', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}',
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        alert('Test result: ' + JSON.stringify(data));
        location.reload();
    });
}

function fixYears() {
    if (confirm('This will change all 2025 dates to 2024. Continue?')) {
        fetch('{{ route("admin.league_sessions.fix_years") }}', {
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': '{{ csrf_token() }}',
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message);
            location.reload();
        });
    }
}

// Update current time display every second
setInterval(function() {
    const now = new Date();
    const options = { 
        timeZone: 'Asia/Kolkata',
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    };
    document.getElementById('current-time').textContent = now.toLocaleDateString('en-US', options);
}, 1000);

// Auto-update session statuses every 10 seconds
setInterval(function() {
    fetch('{{ route("admin.league_sessions.update_status") }}', {
        method: 'POST',
        headers: {
            'X-CSRF-TOKEN': '{{ csrf_token() }}',
            'Content-Type': 'application/json'
        }
    })
    .then(response => response.json())
    .then(data => {
        updateSessionsDisplay(data.all_sessions);
        if (data.updated_to_live > 0 || data.updated_to_completed > 0) {
            showToast(`Auto-updated: ${data.updated_to_live} to live, ${data.updated_to_completed} to completed`, 'success');
        }
    })
    .catch(error => console.log('Auto-update error:', error));
}, 10000); // 10 seconds

function updateSessionsDisplay(sessions) {
    const statusColors = {
        'live': 'success',
        'upcoming': 'info', 
        'completed': 'warning',
        'draft': 'secondary'
    };
    const statusIcons = {
        'live': 'broadcast',
        'upcoming': 'clock',
        'completed': 'check-circle',
        'draft': 'file-earmark'
    };
    
    // Update status badges in table
    sessions.forEach(session => {
        const statusCell = document.querySelector(`tr:has([data-session-id="${session.id}"]) .status-badge`);
        if (statusCell) {
            const color = statusColors[session.status] || 'secondary';
            const icon = statusIcons[session.status] || 'circle';
            statusCell.className = `badge bg-${color} status-badge`;
            statusCell.innerHTML = `<i class="bi bi-${icon} me-1"></i>${session.status.charAt(0).toUpperCase() + session.status.slice(1)}`;
        }
    });
    
    // Update counts in filter buttons
    const counts = sessions.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
    }, {});
    
    document.querySelector('a[href="?status=live"] .badge').textContent = counts.live || 0;
    document.querySelector('a[href="?status=upcoming"] .badge').textContent = counts.upcoming || 0;
    document.querySelector('a[href="?status=completed"] .badge').textContent = counts.completed || 0;
    document.querySelector('a[href="?status=draft"] .badge').textContent = counts.draft || 0;
    document.querySelector('a[href="{{ route("admin.league_sessions.index") }}"] .badge').textContent = sessions.length;
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type} position-fixed`;
    toast.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    toast.innerHTML = `${message} <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Bulk delete functionality
document.addEventListener('DOMContentLoaded', function() {
    const selectAllCheckbox = document.getElementById('selectAll');
    const sessionCheckboxes = document.querySelectorAll('.session-checkbox');
    const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
    
    // Select all functionality
    selectAllCheckbox?.addEventListener('change', function() {
        sessionCheckboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
        });
        toggleBulkDeleteButton();
    });
    
    // Individual checkbox change
    sessionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', toggleBulkDeleteButton);
    });
    
    function toggleBulkDeleteButton() {
        const checkedBoxes = document.querySelectorAll('.session-checkbox:checked');
        if (checkedBoxes.length > 0) {
            bulkDeleteBtn.style.display = 'inline-block';
        } else {
            bulkDeleteBtn.style.display = 'none';
        }
    }
});

function bulkDelete() {
    const checkedBoxes = document.querySelectorAll('.session-checkbox:checked');
    if (checkedBoxes.length === 0) {
        alert('Please select sessions to delete.');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${checkedBoxes.length} selected sessions?`)) {
        return;
    }
    
    const sessionIds = Array.from(checkedBoxes).map(cb => cb.value);
    
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '{{ route("admin.league_sessions.bulk_delete") }}';
    
    const csrfToken = document.createElement('input');
    csrfToken.type = 'hidden';
    csrfToken.name = '_token';
    csrfToken.value = '{{ csrf_token() }}';
    form.appendChild(csrfToken);
    
    sessionIds.forEach(id => {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'session_ids[]';
        input.value = id;
        form.appendChild(input);
    });
    
    document.body.appendChild(form);
    form.submit();
}
</script>

<style>
.spin {
    animation: spin 1s linear infinite;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
</style>
@endsection
