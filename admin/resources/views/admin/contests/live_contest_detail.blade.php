@extends('admin.layouts.app')

@section('title', 'Live Contest Details')

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
    color: #000000 !important;
}
.info-box {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 15px;
    padding: 20px;
    color: white;
    box-shadow: 0 8px 25px rgba(0,0,0,0.1);
    transition: transform 0.3s ease;
    margin-bottom: 20px;
}
.info-box:hover {
    transform: translateY(-5px);
}
.info-box-icon {
    font-size: 2.5rem;
    opacity: 0.8;
    float: left;
    margin-right: 15px;
}
.info-box-content {
    overflow: hidden;
}
.info-box-text {
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 5px;
    display: block;
}
.info-box-number {
    font-size: 1.8rem;
    font-weight: bold;
    display: block;
}
.card {
    border-radius: 15px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    border: none;
}
.card-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 15px 15px 0 0 !important;
    border: none;
}
.table {
    border-radius: 10px;
    overflow: hidden;
}
.badge-lg {
    font-size: 1rem;
    padding: 0.5em 1em;
}
.btn {
    border-radius: 25px;
    transition: all 0.3s ease;
}
.btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
}
</style>
@endsection

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">Live Contest Details - Contest #<span id="contestId">{{ $contestId }}</span></h3>
                    <div>
                        <button class="btn btn-success btn-sm" onclick="refreshData()">
                            <i class="fas fa-sync"></i> Refresh
                        </button>
                        <a href="{{ route('admin.live-management') }}" class="btn btn-secondary btn-sm">
                            <i class="fas fa-arrow-left"></i> Back
                        </a>
                    </div>
                </div>
                <div class="card-body">
                    <!-- Contest Overview -->
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="info-box bg-primary">
                                <span class="info-box-icon"><i class="fas fa-trophy"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Contest Status</span>
                                    <span class="info-box-number" id="contestStatus">Loading...</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-success">
                                <span class="info-box-icon"><i class="fas fa-users"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Participants</span>
                                    <span class="info-box-number" id="participantCount">0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-warning">
                                <span class="info-box-icon"><i class="fas fa-coins"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Prize Pool</span>
                                    <span class="info-box-number" id="prizePool">₹0</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-info">
                                <span class="info-box-icon"><i class="fas fa-rupee-sign"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Entry Fee</span>
                                    <span class="info-box-number" id="entryFee">₹0</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Contest Details -->
                    <div class="row mb-4">
                        <div class="col-md-12">
                            <div class="card">
                                <div class="card-header">
                                    <h5>Contest Information</h5>
                                </div>
                                <div class="card-body">
                                    <div class="row">
                                        <div class="col-md-6">
                                            <table class="table table-sm">
                                                <tr><td><strong>Contest ID:</strong></td><td id="contestIdDetail">{{ $contestId }}</td></tr>
                                                <tr><td><strong>Category:</strong></td><td id="contestCategory">-</td></tr>
                                                <tr><td><strong>Session Name:</strong></td><td id="sessionName">-</td></tr>
                                                <tr><td><strong>Market Type:</strong></td><td id="marketType">-</td></tr>
                                            </table>
                                        </div>
                                        <div class="col-md-6">
                                            <table class="table table-sm">
                                                <tr><td><strong>Start Time:</strong></td><td id="startTime">-</td></tr>
                                                <tr><td><strong>End Time:</strong></td><td id="endTime">-</td></tr>
                                                <tr><td><strong>Total Entries:</strong></td><td id="totalEntries">0</td></tr>
                                                <tr><td><strong>Winning Positions:</strong></td><td id="winningPositions">-</td></tr>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Live Leaderboard -->
                    <div class="card">
                        <div class="card-header">
                            <h5>Live Leaderboard & Portfolios</h5>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive">
                                <table class="table table-striped" id="leaderboardTable">
                                    <thead class="thead-dark">
                                        <tr>
                                            <th>Rank</th>
                                            <th>User ID</th>
                                            <th>User Name</th>
                                            <th>Email</th>
                                            <th>Portfolio Assets</th>
                                            <th>Live Score</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody id="leaderboardBody">
                                        <!-- Dynamic content -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Portfolio Details Modal -->
    <div class="modal fade" id="portfolioModal" tabindex="-1">
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Portfolio Details</h5>
                    <button type="button" class="close" data-dismiss="modal">
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
const contestId = {{ $contestId }};

$(document).ready(function() {
    loadContestData();
    startAutoRefresh();
});

function startAutoRefresh() {
    refreshInterval = setInterval(loadContestData, 15000); // Refresh every 15 seconds
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
}

function refreshData() {
    loadContestData();
    showAlert('Data refreshed successfully!', 'success');
}

function loadContestData() {
    $.ajax({
        url: `{{ url('/admin/api/contest-details') }}/${contestId}`,
        method: 'GET',
        success: function(response) {
            console.log('Contest API Response:', response);
            
            // Show debug info if available
            if (response.debug) {
                console.log('Debug Info:', response.debug);
            }
            
            updateContestOverview(response);
            updateLeaderboard(response.participants);
        },
        error: function(xhr, status, error) {
            console.error('API Error:', xhr.responseText);
            showAlert('Failed to load contest data: ' + error, 'error');
        }
    });
}

function updateContestOverview(data) {
    $('#contestStatus').text(data.contest.status.toUpperCase());
    $('#participantCount').text(data.participants_count || 0);
    $('#prizePool').text('₹' + (data.contest.prize_pool || 0));
    $('#entryFee').text('₹' + (data.contest.entry_fee || 0));
    
    // Update contest details
    $('#contestCategory').text(data.contest.category || 'N/A');
    $('#sessionName').text(data.contest.session_name || 'N/A');
    $('#marketType').text(data.contest.market_type || 'N/A');
    $('#startTime').text(data.contest.start_time ? new Date(data.contest.start_time).toLocaleString() : 'N/A');
    $('#endTime').text(data.contest.end_time ? new Date(data.contest.end_time).toLocaleString() : 'N/A');
    $('#totalEntries').text(data.participants_count || 0);
    $('#winningPositions').text(data.contest.winning_positions || 'N/A');
}

function updateLeaderboard(participants) {
    const tbody = $('#leaderboardBody');
    tbody.empty();
    
    if (!participants || participants.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No participants found</td></tr>');
        return;
    }
    
    participants.forEach(participant => {
        const assets = participant.assets || [];
        const assetList = assets.slice(0, 3).map(asset => {
            return asset.symbol || asset.name || 'Unknown Asset';
        }).join(', ');
        const moreAssets = assets.length > 3 ? ` +${assets.length - 3} more` : '';
        const totalScore = parseFloat(participant.total_score || 0);
        const scoreColor = totalScore >= 0 ? 'success' : 'danger';
        const rankBadge = participant.rank <= 3 ? 'warning' : 'secondary';
        
        const row = `
            <tr class="${participant.rank <= 10 ? 'table-light' : ''}">
                <td>
                    <span class="badge badge-${rankBadge} badge-lg">
                        #${participant.rank}
                    </span>
                </td>
                <td>${participant.user_id}</td>
                <td><strong>${participant.user_name || 'Unknown User'}</strong></td>
                <td><small>${participant.user_email || 'N/A'}</small></td>
                <td>
                    <div>
                        <small>${assetList || 'No assets'}${moreAssets}</small>
                        <br><span class="badge badge-info">${assets.length} assets</span>
                    </div>
                </td>
                <td>
                    <h5 class="text-${scoreColor} mb-0">
                        ${totalScore.toFixed(2)}%
                    </h5>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewPortfolioDetails(${participant.id})">
                        <i class="fas fa-chart-line"></i> View Portfolio
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function viewPortfolioDetails(basketId) {
    $.ajax({
        url: `{{ url('/admin/api/portfolio-details') }}/${basketId}`,
        method: 'GET',
        success: function(response) {
            let html = `
                <div class="row mb-3">
                    <div class="col-md-4">
                        <h6><i class="fas fa-user"></i> User: ${response.user_name || 'Unknown User'}</h6>
                        <p><strong>Total Score:</strong> <span class="text-${parseFloat(response.total_score || 0) >= 0 ? 'success' : 'danger'}">${parseFloat(response.total_score || 0).toFixed(2)}%</span></p>
                    </div>
                    <div class="col-md-4">
                        <p><strong><i class="fas fa-chart-bar"></i> Assets Count:</strong> ${response.assets_count || 0}</p>
                        <p><strong><i class="fas fa-trophy"></i> Current Rank:</strong> ${response.rank || 'N/A'}</p>
                    </div>
                    <div class="col-md-4">
                        <p><strong><i class="fas fa-clock"></i> Contest Started:</strong> ${response.contest_started_at ? new Date(response.contest_started_at).toLocaleString() : 'N/A'}</p>
                        <p><strong><i class="fas fa-flag-checkered"></i> Contest Ended:</strong> ${response.contest_ended_at ? new Date(response.contest_ended_at).toLocaleString() : 'Ongoing'}</p>
                    </div>
                </div>
                
                ${response.starting_prices ? `
                <div class="row mb-3">
                    <div class="col-md-6">
                        <div class="card bg-light">
                            <div class="card-header"><strong><i class="fas fa-play"></i> Starting Prices</strong></div>
                            <div class="card-body">
                                <small>${JSON.stringify(response.starting_prices, null, 2)}</small>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="card bg-light">
                            <div class="card-header"><strong><i class="fas fa-stop"></i> Ending Prices</strong></div>
                            <div class="card-body">
                                <small>${response.ending_prices ? JSON.stringify(response.ending_prices, null, 2) : 'Contest not ended yet'}</small>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="table-responsive">
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th><i class="fas fa-coins"></i> Asset</th>
                                <th><i class="fas fa-times"></i> Multiplier</th>
                                <th><i class="fas fa-tag"></i> Start Price</th>
                                <th><i class="fas fa-chart-line"></i> Current Price</th>
                                <th><i class="fas fa-stop"></i> End Price</th>
                                <th><i class="fas fa-percentage"></i> Change %</th>
                                <th><i class="fas fa-trophy"></i> Weighted Score</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            if (response.portfolio_details && response.portfolio_details.length > 0) {
                response.portfolio_details.forEach(asset => {
                    const startPrice = parseFloat(asset.start_price || 0);
                    const currentPrice = parseFloat(asset.current_price || 0);
                    const endPrice = parseFloat(asset.end_price || 0);
                    const changePercent = parseFloat(asset.change_percent || 0);
                    const weightedScore = parseFloat(asset.weighted_score || 0);
                    const changeColor = changePercent >= 0 ? 'success' : 'danger';
                    const changeIcon = changePercent >= 0 ? 'fa-arrow-up' : 'fa-arrow-down';
                    
                    html += `
                        <tr>
                            <td>
                                <strong>${asset.symbol || 'Unknown'}</strong>
                                <br><small class="text-muted">${asset.name || 'N/A'}</small>
                            </td>
                            <td>
                                <span class="badge badge-primary">${asset.multiplier || 1}x</span>
                            </td>
                            <td class="font-weight-bold">₹${startPrice.toFixed(2)}</td>
                            <td class="font-weight-bold text-info">₹${currentPrice.toFixed(2)}</td>
                            <td class="font-weight-bold text-secondary">${endPrice > 0 ? '₹' + endPrice.toFixed(2) : 'N/A'}</td>
                            <td>
                                <span class="text-${changeColor} font-weight-bold">
                                    <i class="fas ${changeIcon}"></i> ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%
                                </span>
                            </td>
                            <td>
                                <span class="text-${changeColor} font-weight-bold">
                                    <i class="fas ${changeIcon}"></i> ${weightedScore >= 0 ? '+' : ''}${weightedScore.toFixed(2)}%
                                </span>
                            </td>
                        </tr>
                    `;
                });
            } else {
                html += '<tr><td colspan="7" class="text-center">No portfolio data available</td></tr>';
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
</script>
@endsection