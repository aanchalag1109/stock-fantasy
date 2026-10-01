@extends('admin.layouts.app')

@section('title', 'Live Contest Management')

@section('head')
<!-- jQuery -->
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<style>
.table td, .table th {
    color: #000 !important;
}
.table tbody tr {
    color: #000 !important;
}
.badge {
    border-radius: 1rem;
    font-size: 0.85rem;
    font-weight: 600;
    padding: 0.4em 0.8em;
    color: #000000 !important;
}

/* Portfolio Modal Enhancements */
#portfolioModal .modal-content {
    border: none;
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

#portfolioModal .modal-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 15px 15px 0 0;
    border: none;
}

#portfolioModal .portfolio-summary {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
    color: white;
}

#portfolioModal .portfolio-stats {
    background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    border-radius: 12px;
    padding: 15px;
    color: white;
}

#portfolioModal .asset-card {
    background: white;
    border-radius: 10px;
    border: 1px solid #e3e6f0;
    transition: all 0.3s ease;
}

#portfolioModal .asset-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

#portfolioModal .table {
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

#portfolioModal .table thead th {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    font-weight: 600;
}

#portfolioModal .table tbody tr {
    transition: all 0.2s ease;
}

#portfolioModal .table tbody tr:hover {
    background-color: #f8f9fc;
    transform: scale(1.01);
}

#portfolioModal .multiplier-badge {
    background: linear-gradient(45deg, #ff6b6b, #ee5a24);
    color: white;
    border: none;
    border-radius: 20px;
    padding: 5px 12px;
    font-weight: 600;
}

#portfolioModal .price-cell {
    font-family: 'Courier New', monospace;
    font-weight: bold;
}

#portfolioModal .change-positive {
    color: #28a745;
    font-weight: bold;
}

#portfolioModal .change-negative {
    color: #dc3545;
    font-weight: bold;
}

#portfolioModal .asset-symbol {
    background: linear-gradient(45deg, #3742fa, #2f3542);
    color: white;
    padding: 2px 8px;
    border-radius: 15px;
    font-size: 0.8em;
    font-weight: 600;
}
</style>
@endsection

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">Live Contest Management</h3>
                    <div>
                        <select class="form-control form-control-sm d-inline-block" id="statusFilter" style="width: auto; margin-right: 10px;">
                            <option value="all">All Sessions</option>
                            <option value="upcoming">Upcoming</option>
                            <option value="live" selected>Live</option>
                            <option value="completed">Completed</option>
                        </select>
                        <button class="btn btn-success btn-sm" onclick="refreshData()">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="startContests()">
                            <i class="fas fa-play"></i> Start Contests
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="updateScores()">
                            <i class="fas fa-calculator"></i> Update Scores
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="fixOrphanedContests()">
                            <i class="fas fa-broom"></i> Cleanup Orphaned
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Live Sessions Overview -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="info-box bg-info">
                                <span class="info-box-icon"><i class="fas fa-broadcast-tower"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Live Sessions</span>
                                    <span class="info-box-number" id="liveSessionsCount">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-success">
                                <span class="info-box-icon"><i class="fas fa-trophy"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Live Contests</span>
                                    <span class="info-box-number" id="liveContestsCount">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-warning">
                                <span class="info-box-icon"><i class="fas fa-users"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Total Participants</span>
                                    <span class="info-box-number" id="totalParticipants">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-danger">
                                <span class="info-box-icon"><i class="fas fa-coins"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Total Prize Pool</span>
                                    <span class="info-box-number" id="totalPrizePool">₹0</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Live Sessions Table -->
                    <div class="table-responsive">
                        <table class="table table-bordered table-striped" id="liveSessionsTable">
                            <thead class="thead-dark">
                                <tr>
                                    <th>ID</th>
                                    <th>Session Name</th>
                                    <th>Market Type</th>
                                    <th>Status</th>
                                    <th>Start Time</th>
                                    <th>End Time</th>
                                    <th>Contests</th>
                                    <th>Participants</th>
                                    <th>Prize Pool</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="sessionsTableBody">
                                <!-- Dynamic content -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Contest Details Modal -->
    <div class="modal fade" id="contestDetailsModal" tabindex="-1">
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Contest Details</h5>
                    <button type="button" class="close" data-dismiss="modal">
                        <span>&times;</span>
                    </button>
                </div>
                <div class="modal-body" id="contestDetailsBody">
                    <!-- Dynamic content -->
                </div>
            </div>
        </div>
    </div>

    <!-- Leaderboard Modal -->
    <div class="modal fade" id="leaderboardModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Live Leaderboard</h5>
                    <button type="button" class="close" data-dismiss="modal">
                        <span>&times;</span>
                    </button>
                </div>
                <div class="modal-body" id="leaderboardBody">
                    <!-- Dynamic content -->
                </div>
            </div>
        </div>
    </div>

    <!-- Portfolio Modal -->
    <div class="modal fade" id="portfolioModal" tabindex="-1">
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header bg-gradient-primary text-white">
                    <h5 class="modal-title"><i class="fas fa-chart-pie mr-2"></i>Portfolio Details</h5>
                    <button type="button" class="close text-white" data-dismiss="modal">
                        <span>&times;</span>
                    </button>
                </div>
                <div class="modal-body" id="portfolioBody">
                    <!-- Dynamic content -->
                </div>
            </div>
        </div>
    </div>
</div>

<script>
let refreshInterval;

$(document).ready(function() {
    loadLiveData();
    startAutoRefresh();
    
    $('#statusFilter').on('change', function() {
        loadLiveData();
    });
});

function startAutoRefresh() {
    refreshInterval = setInterval(loadLiveData, 10000); // Refresh every 10 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

function refreshData() {
    loadLiveData();
    showAlert('Data refreshed successfully!', 'success');
}

function loadLiveData() {
    const status = $('#statusFilter').val();
    $.ajax({
        url: '{{ url("/api/live-sessions-data") }}',
        method: 'GET',
        data: { status: status },
        success: function(response) {
            updateOverviewCards(response);
            updateSessionsTable(response.sessions);
        },
        error: function() {
            showAlert('Failed to load live data', 'error');
        }
    });
}

function updateOverviewCards(data) {
    $('#liveSessionsCount').text(data.live_sessions_count || 0);
    $('#liveContestsCount').text(data.live_contests_count || 0);
    $('#totalParticipants').text(data.total_participants || 0);
    $('#totalPrizePool').text('₹' + (data.total_prize_pool || 0));
}

function updateSessionsTable(sessions) {
    const tbody = $('#sessionsTableBody');
    tbody.empty();
    
    sessions.forEach((session, index) => {
        const row = `
            <tr class="${session.status === 'live' ? 'table-success' : ''}">
                <td>${index + 1}</td>
                <td><strong>${session.name || 'Unnamed Session'}</strong></td>
                <td>
                    <span class="badge badge-${session.market_type === 'crypto' ? 'warning' : 'info'}">
                        ${session.market_type ? session.market_type.toUpperCase() : 'N/A'}
                    </span>
                </td>
                <td>
                    <span class="badge badge-${getStatusBadge(session.status)}">
                        ${session.status ? session.status.toUpperCase() : 'N/A'}
                    </span>
                </td>
                <td>${formatDateTime(session.start_time)}</td>
                <td>${formatDateTime(session.end_time)}</td>
                <td>${session.contests_count || 0}</td>
                <td>${session.participants_count || 0}</td>
                <td>₹${session.prize_pool || 0}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="openSessionDetail(${session.id})">
                        <i class="fas fa-eye"></i> View Detail
                    </button>
                    ${session.status === 'upcoming' ? 
                        `<button class="btn btn-sm btn-warning" onclick="startSession(${session.id})">
                            <i class="fas fa-play"></i> Start
                        </button>` : ''}
                    ${session.status === 'live' || session.status === 'completing' ? 
                        `<button class="btn btn-sm btn-danger" onclick="manualCompleteSession(${session.id})">
                            <i class="fas fa-check-double"></i> End & Distribute
                        </button>` : ''}
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function getStatusBadge(status) {
    switch(status) {
        case 'live': return 'success';
        case 'upcoming': return 'warning';
        case 'completed': return 'secondary';
        default: return 'light';
    }
}

function formatDateTime(dateTime) {
    if (!dateTime) return 'N/A';
    return new Date(dateTime).toLocaleString();
}

function viewContestDetails(sessionId) {
    $.ajax({
        url: `{{ url('/api/session-contests') }}/${sessionId}`,
        method: 'GET',
        success: function(response) {
            let html = `
                <div class="row">
                    <div class="col-md-6">
                        <h6>Session Info</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Name:</strong></td><td>${response.session.name}</td></tr>
                            <tr><td><strong>Market Type:</strong></td><td>${response.session.market_type}</td></tr>
                            <tr><td><strong>Status:</strong></td><td><span class="badge badge-${getStatusBadge(response.session.status)}">${response.session.status}</span></td></tr>
                            <tr><td><strong>Max Stocks:</strong></td><td>${response.session.max_stocks}</td></tr>
                        </table>
                    </div>
                    <div class="col-md-6">
                        <h6>Statistics</h6>
                        <table class="table table-sm">
                            <tr><td><strong>Total Contests:</strong></td><td>${response.contests.length}</td></tr>
                            <tr><td><strong>Total Participants:</strong></td><td>${response.total_participants}</td></tr>
                            <tr><td><strong>Total Prize Pool:</strong></td><td>₹${response.total_prize_pool}</td></tr>
                        </table>
                    </div>
                </div>
                <hr>
                <h6>Contests</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Category</th>
                                <th>Entry Fee</th>
                                <th>Participants</th>
                                <th>Prize Pool</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            response.contests.forEach(contest => {
                html += `
                    <tr>
                        <td>${contest.id}</td>
                        <td>${contest.category}</td>
                        <td>₹${contest.entry_fee}</td>
                        <td>${contest.joined_count || 0}</td>
                        <td>₹${contest.prize_pool}</td>
                        <td><span class="badge badge-${getStatusBadge(contest.status)}">${contest.status}</span></td>
                        <td>
                            <a href="{{ url('/admin/live-contest-detail') }}/${contest.id}" class="btn btn-xs btn-success" target="_blank">
                                <i class="fas fa-external-link-alt"></i> View Detail
                            </a>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            $('#contestDetailsBody').html(html);
            $('#contestDetailsModal').modal('show');
        },
        error: function() {
            showAlert('Failed to load contest details', 'error');
        }
    });
}

function viewLeaderboard(sessionId) {
    $.ajax({
        url: `{{ url('/admin/api/session-leaderboard') }}/${sessionId}`,
        method: 'GET',
        success: function(response) {
            let html = `
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>User</th>
                                <th>Contest</th>
                                <th>Score</th>
                                <th>Assets</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            response.leaderboard.forEach(entry => {
                html += `
                    <tr>
                        <td>
                            <span class="badge badge-${entry.rank <= 3 ? 'warning' : 'secondary'}">
                                #${entry.rank || 'N/A'}
                            </span>
                        </td>
                        <td>${entry.user_name || 'Unknown'}</td>
                        <td>Contest #${entry.contest_id || 'N/A'}</td>
                        <td>
                            <span class="text-${parseFloat(entry.total_score) >= 0 ? 'success' : 'danger'}">
                                ${parseFloat(entry.total_score || 0).toFixed(2)}
                            </span>
                        </td>
                        <td>${entry.assets ? entry.assets.length : 0} assets</td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            $('#leaderboardBody').html(html);
            $('#leaderboardModal').modal('show');
        },
        error: function() {
            showAlert('Failed to load leaderboard', 'error');
        }
    });
}

function startContests() {
    $.ajax({
        url: '{{ url('/api/cron/start-contests') }}',
        method: 'GET',
        success: function(response) {
            showAlert(`Started ${response.contests_started} contests and ${response.sessions_started} sessions`, 'success');
            loadLiveData();
        },
        error: function() {
            showAlert('Failed to start contests', 'error');
        }
    });
}

function updateScores() {
    $.ajax({
        url: '{{ url('/api/cron/update-scores') }}',
        method: 'GET',
        success: function(response) {
            showAlert('Scores updated successfully', 'success');
            loadLiveData();
        },
        error: function() {
            showAlert('Failed to update scores', 'error');
        }
    });
}

function startSession(sessionId) {
    if (confirm('Are you sure you want to start this session?')) {
        $.ajax({
            url: `{{ url('/admin/api/start-session') }}/${sessionId}`,
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
            },
            success: function(response) {
                showAlert('Session started successfully', 'success');
                loadLiveData();
            },
            error: function() {
                showAlert('Failed to start session', 'error');
            }
        });
    }
}

function endSession(sessionId) {
    if (confirm('Are you sure you want to end this session?')) {
        $.ajax({
            url: `{{ url('/admin/api/end-session') }}/${sessionId}`,
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
            },
            success: function(response) {
                showAlert('Session ended successfully', 'success');
                loadLiveData();
            },
            error: function() {
                showAlert('Failed to end session', 'error');
            }
        });
    }
}
function manualCompleteSession(sessionId) {
    if (confirm('Are you sure you want to end this session and DISTRIBUTE PRIZES? This cannot be undone.')) {
        const btn = event.target.closest('button');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        $.ajax({
            url: `{{ url('/admin/api/manual-complete-session') }}/${sessionId}`,
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
            },
            success: function(response) {
                showAlert(response.message, 'success');
                loadLiveData();
            },
            error: function(xhr) {
                const msg = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to complete session';
                showAlert(msg, 'error');
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        });
    }
}

function fixOrphanedContests() {
    if (confirm('Are you sure you want to fix all orphaned contests?')) {
        $.ajax({
            url: `{{ url('/admin/api/fix-orphaned-contests') }}`,
            method: 'POST',
            headers: {
                'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
            },
            success: function(response) {
                showAlert(response.message, 'success');
                loadLiveData();
            },
            error: function() {
                showAlert('Failed to fix orphaned contests', 'error');
            }
        });
    }
}

function showAlert(message, type) {
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const alert = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="close" data-dismiss="alert">
                <span>&times;</span>
            </button>
        </div>
    `;
    $('.container-fluid').prepend(alert);
    setTimeout(() => $('.alert').fadeOut(), 5000);
}

// Cleanup on page unload
$(window).on('beforeunload', function() {
    stopAutoRefresh();
});

function openSessionDetail(sessionId) {
    window.open(`{{ url('/admin/session-contests') }}/${sessionId}`, '_blank');
}

function viewContestParticipants(contestId) {
    $.ajax({
        url: `{{ url('/admin/api/contest-details') }}/${contestId}`,
        method: 'GET',
        success: function(response) {
            let html = `
                <div class="row mb-3">
                    <div class="col-md-12">
                        <h6>Contest: ${response.contest.category} - Entry Fee: ₹${response.contest.entry_fee}</h6>
                        <p><strong>Total Participants:</strong> ${response.participants_count} | <strong>Prize Pool:</strong> ₹${response.contest.prize_pool}</p>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-sm">
                        <thead>
                            <tr>
                                <th>Rank</th>
                                <th>User</th>
                                <th>Portfolio</th>
                                <th>Live Score</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            response.participants.forEach(participant => {
                const assets = participant.assets || [];
                const assetList = assets.map(asset => `${asset.symbol || 'N/A'}`).join(', ');
                const scoreColor = parseFloat(participant.total_score || 0) >= 0 ? 'success' : 'danger';
                
                html += `
                    <tr>
                        <td>
                            <span class="badge badge-${participant.rank <= 3 ? 'warning' : 'secondary'}">
                                #${participant.rank}
                            </span>
                        </td>
                        <td>
                            <strong>${participant.user_name || 'Unknown'}</strong>
                            <br><small class="text-muted">ID: ${participant.user_id}</small>
                        </td>
                        <td>
                            <small>${assetList || 'No assets'}</small>
                            <br><span class="badge badge-info">${assets.length} assets</span>
                        </td>
                        <td>
                            <span class="text-${scoreColor} font-weight-bold">
                                ${parseFloat(participant.total_score || 0).toFixed(2)}%
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-xs btn-outline-primary" onclick="viewUserPortfolio(${participant.id})">
                                <i class="fas fa-chart-line"></i> Portfolio
                            </button>
                        </td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            $('#leaderboardBody').html(html);
            $('#leaderboardModal .modal-title').text('Contest Participants & Live Calculations');
            $('#leaderboardModal').modal('show');
        },
        error: function() {
            showAlert('Failed to load contest participants', 'error');
        }
    });
}

function viewUserPortfolio(participantId) {
    $.ajax({
        url: `{{ url('/admin/api/portfolio-details') }}/${participantId}`,
        method: 'GET',
        success: function(response) {
            const participant = response.participant;
            const assets = response.assets || [];
            
            let html = `
                <div class="row mb-4">
                    <div class="col-md-6">
                        <div class="portfolio-summary">
                            <h6><i class="fas fa-user mr-2"></i>User: ${participant.user_name || 'Unknown'}</h6>
                            <h4><strong>Total Score:</strong> 
                                <span class="${parseFloat(participant.total_score || 0) >= 0 ? 'text-light' : 'text-warning'}">
                                    ${parseFloat(participant.total_score || 0).toFixed(2)}%
                                </span>
                            </h4>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="portfolio-stats">
                            <p><strong><i class="fas fa-chart-bar mr-2"></i>Assets Count:</strong> ${assets.length}</p>
                            <p><strong><i class="fas fa-clock mr-2"></i>Last Updated:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th><i class="fas fa-coins mr-1"></i>Asset</th>
                                <th><i class="fas fa-times mr-1"></i>Multiplier</th>
                                <th><i class="fas fa-tag mr-1"></i>Start Price</th>
                                <th><i class="fas fa-chart-line mr-1"></i>Current Price</th>
                                <th><i class="fas fa-percentage mr-1"></i>Change %</th>
                                <th><i class="fas fa-trophy mr-1"></i>Weighted Score</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            assets.forEach(asset => {
                const changePercent = parseFloat(asset.change_percent || 0);
                const weightedScore = parseFloat(asset.weighted_score || 0);
                const changeClass = changePercent >= 0 ? 'change-positive' : 'change-negative';
                const scoreClass = weightedScore >= 0 ? 'change-positive' : 'change-negative';
                const changeIcon = changePercent >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                
                html += `
                    <tr class="asset-card">
                        <td>
                            <strong>${asset.name || 'N/A'}</strong>
                            <br><span class="asset-symbol">${asset.symbol || 'N/A'}</span>
                        </td>
                        <td>
                            <span class="multiplier-badge">
                                ${asset.multiplier || 1}x
                            </span>
                        </td>
                        <td class="price-cell">₹${parseFloat(asset.start_price || 0).toFixed(2)}</td>
                        <td class="price-cell">₹${parseFloat(asset.current_price || 0).toFixed(2)}</td>
                        <td>
                            <span class="${changeClass}">
                                <i class="fas ${changeIcon} mr-1"></i>${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%
                            </span>
                        </td>
                        <td>
                            <span class="${scoreClass} font-weight-bold">
                                <i class="fas ${changeIcon} mr-1"></i>${weightedScore >= 0 ? '+' : ''}${weightedScore.toFixed(2)}%
                            </span>
                        </td>
                    </tr>
                `;
            });
            
            if (assets.length === 0) {
                html += `
                    <tr>
                        <td colspan="6" class="text-center text-muted py-4">
                            <i class="fas fa-inbox fa-2x mb-2"></i>
                            <br>No assets found in portfolio
                        </td>
                    </tr>
                `;
            }
            
            html += `
                        </tbody>
                    </table>
                </div>
            `;
            
            $('#portfolioBody').html(html);
            $('#portfolioModal').modal('show');
        },
        error: function() {
            showAlert('Failed to load portfolio details', 'error');
        }
    });
}
</script>
@endsection