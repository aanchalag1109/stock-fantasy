@extends('admin.layouts.app')

@section('title', 'User Baskets Performance - Contest #' . $contest->id)

@section('content')
<div class="container-fluid">
    <div class="row">
        <div class="col-12">
            <div class="card">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="card-title">User Baskets Performance - {{ $contest->session_name ?? 'Contest #' . $contest->id }}</h3>
                    <div>
                        <a href="{{ route('admin.performance.show', $contest->id) }}" class="btn btn-secondary">
                            <i class="fas fa-arrow-left"></i> Back to Performance
                        </a>
                        <button class="btn btn-primary" onclick="refreshData()">
                            <i class="fas fa-sync-alt"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row mb-4">
                        <div class="col-md-3">
                            <div class="info-box bg-info">
                                <span class="info-box-icon"><i class="fas fa-users"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Total Participants</span>
                                    <span class="info-box-number">{{ count($userBaskets) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-success">
                                <span class="info-box-icon"><i class="fas fa-arrow-up"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">In Profit</span>
                                    <span class="info-box-number">{{ $userBaskets->where('total_score', '>', 0)->count() }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-danger">
                                <span class="info-box-icon"><i class="fas fa-arrow-down"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">In Loss</span>
                                    <span class="info-box-number">{{ $userBaskets->where('total_score', '<', 0)->count() }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="info-box bg-warning">
                                <span class="info-box-icon"><i class="fas fa-equals"></i></span>
                                <div class="info-box-content">
                                    <span class="info-box-text">Break Even</span>
                                    <span class="info-box-number">{{ $userBaskets->where('total_score', '=', 0)->count() }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="table table-striped table-hover">
                            <thead class="thead-dark">
                                <tr>
                                    <th>Rank</th>
                                    <th>User</th>
                                    <th>Total Score</th>
                                    <th>Assets Performance</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($userBaskets as $basket)
                                <tr>
                                    <td>
                                        <span class="badge badge-primary">#{{ $basket['rank'] }}</span>
                                    </td>
                                    <td>
                                        <strong>{{ $basket['user_name'] }}</strong>
                                        @if($basket['user_mobile'])
                                            <br><small class="text-muted">{{ $basket['user_mobile'] }}</small>
                                        @endif
                                    </td>
                                    <td>
                                        <span class="badge badge-{{ $basket['total_score'] > 0 ? 'success' : ($basket['total_score'] < 0 ? 'danger' : 'secondary') }}">
                                            {{ $basket['total_score'] > 0 ? '+' : '' }}{{ $basket['total_score'] }}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-info" onclick="toggleAssets({{ $basket['user_id'] }})">
                                            <i class="fas fa-eye"></i> View Assets ({{ count($basket['assets']) }})
                                        </button>
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="viewDetails({{ $basket['user_id'] }})">
                                            <i class="fas fa-chart-line"></i> Details
                                        </button>
                                    </td>
                                </tr>
                                <tr id="assets-{{ $basket['user_id'] }}" style="display: none;">
                                    <td colspan="5">
                                        <div class="card">
                                            <div class="card-body">
                                                <h6>Asset Performance Details:</h6>
                                                <div class="table-responsive">
                                                    <table class="table table-sm">
                                                        <thead>
                                                            <tr>
                                                                <th>Symbol</th>
                                                                <th>Name</th>
                                                                <th>Multiplier</th>
                                                                <th>Start Price</th>
                                                                <th>Current Price</th>
                                                                <th>Change %</th>
                                                                <th>Score</th>
                                                                <th>Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            @foreach($basket['assets'] as $asset)
                                                            <tr>
                                                                <td><strong>{{ $asset['symbol'] }}</strong></td>
                                                                <td>{{ $asset['name'] }}</td>
                                                                <td>{{ $asset['multiplier'] }}x</td>
                                                                <td>₹{{ number_format($asset['start_price'], 2) }}</td>
                                                                <td>₹{{ number_format($asset['current_price'], 2) }}</td>
                                                                <td>
                                                                    <span class="badge badge-{{ $asset['percent_change'] > 0 ? 'success' : ($asset['percent_change'] < 0 ? 'danger' : 'secondary') }}">
                                                                        {{ $asset['percent_change'] > 0 ? '+' : '' }}{{ $asset['percent_change'] }}%
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <span class="badge badge-{{ $asset['score'] > 0 ? 'success' : ($asset['score'] < 0 ? 'danger' : 'secondary') }}">
                                                                        {{ $asset['score'] > 0 ? '+' : '' }}{{ $asset['score'] }}
                                                                    </span>
                                                                </td>
                                                                <td>
                                                                    <i class="fas fa-{{ $asset['status'] == 'profit' ? 'arrow-up text-success' : ($asset['status'] == 'loss' ? 'arrow-down text-danger' : 'minus text-secondary') }}"></i>
                                                                    {{ ucfirst($asset['status']) }}
                                                                </td>
                                                            </tr>
                                                            @endforeach
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script>
function toggleAssets(userId) {
    const row = document.getElementById('assets-' + userId);
    if (row.style.display === 'none') {
        row.style.display = 'table-row';
    } else {
        row.style.display = 'none';
    }
}

function viewDetails(userId) {
    // Implement detailed view modal or redirect
    alert('Detailed view for User ID: ' + userId);
}

function refreshData() {
    location.reload();
}

// Auto refresh every 30 seconds
setInterval(function() {
    refreshData();
}, 30000);
</script>
@endsection