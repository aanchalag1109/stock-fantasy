@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 mb-0"><i class="bi bi-graph-up text-success me-2"></i>Session Performance</h1>
        <div class="badge bg-success" id="autoRefreshStatus">
            <i class="bi bi-arrow-clockwise me-1"></i>Auto-refresh: ON (10s)
        </div>
    </div>

    <!-- Filter Tabs -->
    <div class="card shadow-sm border-0 mb-4">
        <div class="card-header bg-gradient-primary text-white">
            <ul class="nav nav-tabs card-header-tabs" id="sessionTabs" role="tablist">
                <li class="nav-item" role="presentation">
                    <button class="nav-link active text-white" id="all-tab" data-bs-toggle="tab" data-bs-target="#all" type="button" role="tab">
                        All Sessions
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link text-white" id="live-tab" data-bs-toggle="tab" data-bs-target="#live" type="button" role="tab">
                        Live
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link text-white" id="upcoming-tab" data-bs-toggle="tab" data-bs-target="#upcoming" type="button" role="tab">
                        Upcoming
                    </button>
                </li>
                <li class="nav-item" role="presentation">
                    <button class="nav-link text-white" id="completed-tab" data-bs-toggle="tab" data-bs-target="#completed" type="button" role="tab">
                        Completed
                    </button>
                </li>
            </ul>
        </div>
        <div class="card-body p-0">
            <div class="tab-content" id="sessionTabContent">
                <div class="tab-pane fade show active" id="all" role="tabpanel">
                    <div id="sessions-container">
                        <div class="text-center p-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #6610f2 100%);
}
.session-card {
    transition: transform 0.2s;
}
.session-card:hover {
    transform: translateY(-2px);
}
</style>

<script>
let currentFilter = 'all';

// Load sessions on page load
$(document).ready(function() {
    loadSessions('all');
    
    // Tab click handlers
    $('#sessionTabs button').on('click', function() {
        const filter = $(this).attr('id').replace('-tab', '');
        currentFilter = filter;
        loadSessions(filter);
    });
});

function loadSessions(status = 'all') {
    $('#sessions-container').html(`
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>
    `);
    
    $.ajax({
        url: '/api/live-sessions-data',
        method: 'GET',
        data: { status: status },
        success: function(response) {
            if (response.success) {
                displaySessions(response.sessions);
            } else {
                $('#sessions-container').html(`
                    <div class="alert alert-danger m-3">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        Error: ${response.error}
                    </div>
                `);
            }
        },
        error: function(xhr) {
            $('#sessions-container').html(`
                <div class="alert alert-danger m-3">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load sessions. Please try again.
                </div>
            `);
        }
    });
}

function displaySessions(sessions) {
    if (!sessions || sessions.length === 0) {
        $('#sessions-container').html(`
            <div class="text-center p-4">
                <i class="bi bi-inbox display-4 text-muted"></i>
                <h5 class="mt-3">No Sessions Found</h5>
            </div>
        `);
        return;
    }
    
    let html = '<div class="table-responsive">';
    html += '<table class="table table-hover mb-0">';
    html += `
        <thead class="table-light">
            <tr>
                <th>Session ID</th>
                <th>Name</th>
                <th>Market Type</th>
                <th>Status</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
    `;
    
    sessions.forEach(session => {
        const statusBadge = getStatusBadge(session.status);
        const startTime = new Date(session.start_time).toLocaleString();
        const endTime = new Date(session.end_time).toLocaleString();
        
        html += `
            <tr class="session-row">
                <td class="fw-bold">#${session.id}</td>
                <td>${session.name}</td>
                <td><span class="badge bg-info">${session.market_type}</span></td>
                <td>${statusBadge}</td>
                <td>${startTime}</td>
                <td>${endTime}</td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-1" onclick="viewSessionDetails(${session.id})">
                        <i class="bi bi-eye me-1"></i>Details
                    </button>
                    <button class="btn btn-sm btn-outline-success" onclick="viewSessionContests(${session.id})">
                        <i class="bi bi-trophy me-1"></i>Contests
                    </button>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table></div>';
    $('#sessions-container').html(html);
}

function getStatusBadge(status) {
    const badges = {
        'live': '<span class="badge bg-success">Live</span>',
        'upcoming': '<span class="badge bg-info">Upcoming</span>',
        'completed': '<span class="badge bg-warning">Completed</span>'
    };
    return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
}

function viewSessionDetails(sessionId) {
    window.location.href = `/admin/performance/session/${sessionId}`;
}

function viewSessionContests(sessionId) {
    window.location.href = `/admin/performance/session/${sessionId}/contests`;
}

// Auto-refresh every 10 seconds
setInterval(function() {
    loadSessions(currentFilter);
}, 10000);
</script>
@endsection