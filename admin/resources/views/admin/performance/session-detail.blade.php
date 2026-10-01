@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <nav aria-label="breadcrumb">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ route('admin.performance.sessions') }}">Sessions</a></li>
                    <li class="breadcrumb-item active">Session #{{ $sessionId }}</li>
                </ol>
            </nav>
            <h1 class="h3 mb-0"><i class="bi bi-graph-up text-success me-2"></i>Session Details</h1>
        </div>
        <div>
            <button onclick="showSessionPrices()" class="btn btn-info me-2">
                <i class="bi bi-currency-dollar me-1"></i>Show Prices
            </button>
            <button onclick="testTransaction()" class="btn btn-warning me-2">
                <i class="bi bi-cash-coin me-1"></i>Test Transaction
            </button>
            <a href="{{ route('admin.performance.sessions') }}" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left me-1"></i>Back to Sessions
            </a>
        </div>
    </div>

    <!-- Session Info Card -->
    <div class="card shadow-sm border-0 mb-4" id="session-info">
        <div class="card-header bg-gradient-primary text-white">
            <h5 class="mb-0"><i class="bi bi-info-circle me-2"></i>Session Information</h5>
        </div>
        <div class="card-body">
            <div class="text-center p-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
            </div>
        </div>
    </div>

    <!-- Contests Card -->
    <div class="card shadow-sm border-0">
        <div class="card-header bg-gradient-success text-white">
            <h5 class="mb-0"><i class="bi bi-trophy-fill me-2"></i>Session Contests</h5>
        </div>
        <div class="card-body p-0">
            <div id="contests-container">
                <div class="text-center p-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Session Prices Modal -->
<div class="modal fade" id="sessionPricesModal" tabindex="-1" aria-labelledby="sessionPricesModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header bg-primary text-white">
                <h5 class="modal-title" id="sessionPricesModalLabel">
                    <i class="bi bi-currency-dollar me-2"></i>Session Asset Prices
                </h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="pricesContainer">
                    <div class="text-center p-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">Loading prices...</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            </div>
        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #6610f2 100%);
}
.bg-gradient-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
}
</style>

<script>
const sessionId = {{ $sessionId }};

document.addEventListener('DOMContentLoaded', function() {
    loadSessionDetails();
    loadSessionContests();
});

// ─── Load Session Details ───────────────────────────────────────────
function loadSessionDetails() {
    fetch(`{{ url('/api/sessions') }}/${sessionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.session) {
                displaySessionInfo(data.session);
            }
        })
        .catch(error => {
            document.querySelector('#session-info .card-body').innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load session details.
                </div>
            `;
        });
}

// ─── Load Session Contests ──────────────────────────────────────────
function loadSessionContests() {
    fetch(`{{ url('/api/session-contests') }}/${sessionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success && data.contests) {
                displayContests(data.contests);
            } else {
                document.getElementById('contests-container').innerHTML = `
                    <div class="text-center p-4">
                        <i class="bi bi-inbox display-4 text-muted"></i>
                        <h5 class="mt-3">No Contests Found</h5>
                    </div>
                `;
            }
        })
        .catch(error => {
            document.getElementById('contests-container').innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load contests.
                </div>
            `;
        });
}

// ─── Display Session Info ───────────────────────────────────────────
function displaySessionInfo(session) {
    const statusBadge = getStatusBadge(session.status);
    const startTime = new Date(session.start_time).toLocaleString();
    const endTime = new Date(session.end_time).toLocaleString();

    document.querySelector('#session-info .card-body').innerHTML = `
        <div class="row">
            <div class="col-md-6">
                <h5>${session.name}</h5>
                <p class="text-muted mb-2">Session ID: #${session.id}</p>
                <p class="mb-2"><strong>Status:</strong> ${statusBadge}</p>
                <p class="mb-2"><strong>Market Type:</strong>
                    <span class="badge bg-info">${session.market_type}</span>
                </p>
                <p class="mb-2"><strong>Max Stocks:</strong> ${session.max_stocks}</p>
            </div>
            <div class="col-md-6">
                <p class="mb-2"><strong>Start Time:</strong> ${startTime}</p>
                <p class="mb-2"><strong>End Time:</strong> ${endTime}</p>
            </div>
        </div>
    `;
}

// ─── Display Contests Table ─────────────────────────────────────────
function displayContests(contests) {
    if (!contests || contests.length === 0) {
        document.getElementById('contests-container').innerHTML = `
            <div class="text-center p-4">
                <i class="bi bi-inbox display-4 text-muted"></i>
                <h5 class="mt-3">No Contests Found</h5>
            </div>
        `;
        return;
    }

    let html = '<div class="table-responsive">';
    html += '<table class="table table-hover mb-0">';
    html += `
        <thead class="table-light">
            <tr>
                <th>Contest ID</th>
                <th>Category</th>
                <th>Prize Pool</th>
                <th>Entry Fee</th>
                <th>Spots</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
    `;

    contests.forEach(contest => {
        const maxParticipants = contest.max_participants || contest.participants || 0;
        html += `
            <tr>
                <td class="fw-bold">#${contest.id}</td>
                <td>${contest.category}</td>
                <td class="text-success fw-bold">₹${parseFloat(contest.prize_pool || 0).toLocaleString()}</td>
                <td class="text-danger">₹${parseFloat(contest.entry_fee || 0).toLocaleString()}</td>
                <td><span class="badge bg-primary">${contest.joined_count || 0}/${maxParticipants}</span></td>
                <td>
                    <a href="{{ url('/admin/performance') }}/${contest.id}"
                       class="btn btn-sm btn-outline-primary" target="_blank">
                        <i class="bi bi-eye me-1"></i>View Details
                    </a>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table></div>';
    document.getElementById('contests-container').innerHTML = html;
}

// ─── Status Badge Helper ────────────────────────────────────────────
function getStatusBadge(status) {
    const badges = {
        'live':      '<span class="badge bg-success">Live</span>',
        'upcoming':  '<span class="badge bg-info">Upcoming</span>',
        'completed': '<span class="badge bg-warning">Completed</span>'
    };
    return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
}

// ─── Test Transaction ───────────────────────────────────────────────
function testTransaction() {
    if (!confirm('Create a test transaction for session ' + sessionId + '?')) return;

    fetch(`{{ url('/api/test-transaction') }}/${sessionId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Test transaction created successfully!\nTransaction ID: ' + (data.transaction_id || 'N/A'));
        } else {
            alert('Error: ' + (data.message || 'Failed to create transaction'));
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    });
}

// ─── Show Session Prices (Modal) ────────────────────────────────────
function showSessionPrices() {
    const modal = new bootstrap.Modal(document.getElementById('sessionPricesModal'));
    modal.show();

    // Reset to loading spinner
    document.getElementById('pricesContainer').innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading prices...</span>
            </div>
        </div>
    `;

    fetch(`{{ url('/api/session-prices') }}/${sessionId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displaySessionPrices(data);
            } else {
                document.getElementById('pricesContainer').innerHTML = `
                    <div class="alert alert-warning">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        ${data.message || 'No price data found for this session'}
                    </div>
                `;
            }
        })
        .catch(error => {
            document.getElementById('pricesContainer').innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load session prices: ${error.message}
                </div>
            `;
        });
}

// ─── Display Session Prices ─────────────────────────────────────────
function displaySessionPrices(data) {
    const { start_prices = [], end_prices = [], session_info = {} } = data;

    let html = `
        <div class="row mb-4">
            <div class="col-md-12">
                <div class="alert alert-info">
                    <h6 class="mb-2"><i class="bi bi-info-circle me-2"></i>Session Information</h6>
                    <p class="mb-1"><strong>Session ID:</strong> ${session_info.id || sessionId}</p>
                    <p class="mb-1"><strong>Name:</strong> ${session_info.name || 'N/A'}</p>
                    <p class="mb-1"><strong>Status:</strong> ${getStatusBadge(session_info.status)}</p>
                    <p class="mb-0"><strong>Market Type:</strong>
                        <span class="badge bg-info">${session_info.market_type || 'N/A'}</span>
                    </p>
                </div>
            </div>
        </div>
    `;

    if (start_prices.length === 0 && end_prices.length === 0) {
        html += `
            <div class="alert alert-warning text-center">
                <i class="bi bi-exclamation-triangle display-4 text-warning"></i>
                <h5 class="mt-3">No Price Data Available</h5>
                <p>This session hasn't been started yet or prices haven't been captured.</p>
            </div>
        `;
    } else {
        // ── Start Prices Column ──
        html += '<div class="row"><div class="col-md-6">';
        html += `
            <div class="card border-success">
                <div class="card-header bg-success text-white">
                    <h6 class="mb-0"><i class="bi bi-play-circle me-2"></i>Start Prices (${start_prices.length})</h6>
                </div>
                <div class="card-body p-0">
        `;

        if (start_prices.length > 0) {
            html += '<div class="table-responsive" style="max-height:400px;overflow-y:auto">';
            html += '<table class="table table-sm table-hover mb-0">';
            html += '<thead class="table-light sticky-top"><tr><th>Symbol</th><th>Start Price</th><th>Time</th></tr></thead><tbody>';
            start_prices.forEach(price => {
                const time = price.start_price_fetched_at
                    ? new Date(price.start_price_fetched_at).toLocaleString()
                    : 'N/A';
                html += `
                    <tr>
                        <td class="fw-bold">${price.asset_symbol}</td>
                        <td class="text-success">₹${parseFloat(price.start_price).toLocaleString()}</td>
                        <td class="text-muted small">${time}</td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        } else {
            html += '<div class="text-center p-3 text-muted">No start prices available</div>';
        }

        html += '</div></div></div>';

        // ── End Prices Column ──
        html += '<div class="col-md-6">';
        html += `
            <div class="card border-danger">
                <div class="card-header bg-danger text-white">
                    <h6 class="mb-0"><i class="bi bi-stop-circle me-2"></i>End Prices (${end_prices.length})</h6>
                </div>
                <div class="card-body p-0">
        `;

        if (end_prices.length > 0) {
            html += '<div class="table-responsive" style="max-height:400px;overflow-y:auto">';
            html += '<table class="table table-sm table-hover mb-0">';
            html += '<thead class="table-light sticky-top"><tr><th>Symbol</th><th>End Price</th><th>Change</th><th>Time</th></tr></thead><tbody>';
            end_prices.forEach(price => {
                const startPrice = start_prices.find(sp => sp.asset_symbol === price.asset_symbol)?.start_price || 0;
                const change = startPrice > 0
                    ? ((price.end_price - startPrice) / startPrice * 100)
                    : 0;
                const changeClass = change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted';
                const changeIcon  = change > 0 ? '↑' : change < 0 ? '↓' : '→';
                const time = price.end_price_fetched_at
                    ? new Date(price.end_price_fetched_at).toLocaleString()
                    : 'N/A';

                html += `
                    <tr>
                        <td class="fw-bold">${price.asset_symbol}</td>
                        <td class="text-danger">₹${parseFloat(price.end_price).toLocaleString()}</td>
                        <td class="${changeClass}">${changeIcon} ${change.toFixed(2)}%</td>
                        <td class="text-muted small">${time}</td>
                    </tr>
                `;
            });
            html += '</tbody></table></div>';
        } else {
            html += '<div class="text-center p-3 text-muted">No end prices available</div>';
        }

        html += '</div></div></div></div>';
    }

    document.getElementById('pricesContainer').innerHTML = html;
}
</script>
@endsection