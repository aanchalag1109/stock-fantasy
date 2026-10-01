@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <!-- Header Section -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-eye text-success me-2"></i>View Session</h1>
            <p class="text-muted mb-0">{{ $leagueSession->name }}</p>
        </div>
        <div>
            <a href="{{ route('admin.league_sessions.index') }}" class="btn btn-outline-secondary me-2">
                <i class="bi bi-arrow-left me-1"></i>Back to Sessions
            </a>
            @if($leagueSession->status === 'upcoming')
                <a href="{{ route('admin.league_sessions.edit', $leagueSession) }}" class="btn btn-primary">
                    <i class="bi bi-pencil me-1"></i>Edit Session
                </a>
            @endif
            <button class="btn btn-warning ms-2" onclick="refetchMissingPrices({{ $leagueSession->id }})">
                <i class="bi bi-arrow-repeat me-1"></i>Refetch Missing Prices
            </button>
        </div>
    </div>

    <!-- Status Alert -->
    <div class="alert alert-{{ $leagueSession->status === 'upcoming' ? 'info' : 'warning' }} border-0 shadow-sm mb-4">
        <i class="bi bi-{{ $leagueSession->status === 'upcoming' ? 'clock' : 'check-circle' }}-fill me-2"></i>
        <strong>{{ ucfirst($leagueSession->status) }} Session:</strong> 
        @if($leagueSession->status === 'upcoming')
            This session is scheduled to start at {{ date('M j, Y H:i', strtotime($leagueSession->start_time)) }}
        @else
            This session has been completed
        @endif
    </div>

    <div class="row">
        <!-- Session Details -->
        <div class="col-lg-8">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-gradient-success text-white">
                    <h5 class="mb-0"><i class="bi bi-info-circle-fill me-2"></i>Session Details</h5>
                </div>
                <div class="card-body p-4">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Session Name</label>
                            <div class="fs-5 fw-bold text-dark">{{ $leagueSession->name }}</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Market Type</label>
                            <div>
                                <span class="badge {{ $leagueSession->market_type == 'stock' ? 'bg-primary' : 'bg-warning' }} fs-6">
                                    <i class="bi bi-{{ $leagueSession->market_type == 'stock' ? 'graph-up' : 'currency-bitcoin' }} me-1"></i>
                                    {{ ucfirst($leagueSession->market_type) }}
                                </span>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Max Assets in Portfolio</label>
                            <div class="fs-5 fw-bold text-dark">{{ $leagueSession->max_stocks }}</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Status</label>
                            <div>
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
                                <span class="badge bg-{{ $statusColors[$leagueSession->status] ?? 'secondary' }} fs-6">
                                    <i class="bi bi-{{ $statusIcons[$leagueSession->status] ?? 'circle' }} me-1"></i>
                                    {{ ucfirst($leagueSession->status) }}
                                </span>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Start Time</label>
                            <div class="fs-6 text-dark">
                                <i class="bi bi-play-circle text-success me-1"></i>
                                {{ date('M j, Y H:i', strtotime($leagueSession->start_time)) }}
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">End Time</label>
                            <div class="fs-6 text-dark">
                                <i class="bi bi-stop-circle text-danger me-1"></i>
                                {{ date('M j, Y H:i', strtotime($leagueSession->end_time)) }}
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Active Status</label>
                            <div>
                                <span class="badge {{ $leagueSession->active ? 'bg-success' : 'bg-danger' }} fs-6">
                                    <i class="bi bi-{{ $leagueSession->active ? 'check' : 'x' }}-circle me-1"></i>
                                    {{ $leagueSession->active ? 'Active' : 'Inactive' }}
                                </span>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="form-label fw-semibold text-muted">Created</label>
                            <div class="fs-6 text-dark">{{ $leagueSession->created_at->format('M j, Y H:i') }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Session Statistics -->
        <div class="col-lg-4">
            <div class="card shadow-sm border-0 mb-4">
                <div class="card-header bg-gradient-info text-white">
                    <h5 class="mb-0"><i class="bi bi-bar-chart-fill me-2"></i>Statistics</h5>
                </div>
                <div class="card-body p-4">
                    <div class="row text-center">
                        <div class="col-12 mb-3">
                            <div class="bg-light rounded p-3">
                                <div class="fs-2 fw-bold text-primary">{{ $contestsCount }}</div>
                                <div class="text-muted">Total Contests</div>
                            </div>
                        </div>
                        <div class="col-12 mb-3">
                            <div class="bg-light rounded p-3">
                                <div class="fs-2 fw-bold text-success">{{ $uniqueAssets->count() }}</div>
                                <div class="text-muted">Available Assets</div>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="bg-light rounded p-3">
                                <div class="fs-2 fw-bold text-warning">{{ $totalParticipants }}</div>
                                <div class="text-muted">Total Participants</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>



    <!-- Selected Assets by Category -->
    <div class="card shadow-sm border-0 mb-4">
        <div class="card-header bg-gradient-success text-white">
            <h5 class="mb-0"><i class="bi bi-check-circle-fill me-2"></i>Selected Assets by Category</h5>
        </div>
        <div class="card-body p-4">
            @php
                $assetsByCategory = \DB::table('league_session_assets')
                    ->leftJoin('market_type_categories', 'league_session_assets.category_id', '=', 'market_type_categories.id')
                    ->leftJoin('assets', 'league_session_assets.asset_symbol', '=', 'assets.symbol')
                    ->where('league_session_assets.league_session_id', $leagueSession->id)
                    ->select(
                        'league_session_assets.asset_symbol',
                        'assets.name as asset_name',
                        'market_type_categories.name as category_name',
                        'market_type_categories.id as category_id'
                    )
                    ->orderBy('market_type_categories.name')
                    ->orderBy('league_session_assets.asset_symbol')
                    ->get()
                    ->groupBy('category_name');
            @endphp
            
            @forelse($assetsByCategory as $categoryName => $categoryAssets)
            <div class="mb-4">
                <h6 class="text-primary mb-3">
                    <i class="bi bi-tag me-1"></i>
                    {{ $categoryName ?: 'Unknown Category' }}
                    <span class="badge bg-primary ms-2">{{ $categoryAssets->unique('asset_symbol')->count() }} assets</span>
                    @php
                        $country = 'Unknown';
                        $capSize = 'Unknown';
                        if ($categoryName) {
                            if (str_contains($categoryName, 'Indian')) $country = '🇮🇳 Indian';
                            elseif (str_contains($categoryName, 'US')) $country = '🇺🇸 US';
                            elseif (str_contains($categoryName, 'UK')) $country = '🇬🇧 UK';
                            elseif (str_contains($categoryName, 'Crypto')) $country = '💰 Crypto';
                            
                            if (str_contains($categoryName, 'Small')) $capSize = 'Small Cap';
                            elseif (str_contains($categoryName, 'Mid')) $capSize = 'Mid Cap';
                            elseif (str_contains($categoryName, 'Large')) $capSize = 'Large Cap';
                        }
                    @endphp
                    <span class="badge bg-info ms-1">{{ $country }}</span>
                    @if($capSize !== 'Unknown')
                        <span class="badge bg-warning ms-1">{{ $capSize }}</span>
                    @endif
                </h6>
                <div class="row">
                    @foreach($categoryAssets->unique('asset_symbol') as $asset)
                    <div class="col-md-4 mb-3">
                        <div class="d-flex align-items-center p-3 bg-light rounded">
                            <div class="me-3">
                                <img src="https://financialmodelingprep.com/image-stock/{{ $asset->asset_symbol }}.png" 
                                     alt="{{ $asset->asset_symbol }}" class="rounded-circle" 
                                     style="width: 40px; height: 40px; object-fit: cover;"
                                     onerror="this.src='https://ui-avatars.com/api/?name={{ $asset->asset_symbol }}&size=40&background=28a745&color=fff';">
                            </div>
                            <div>
                                <div class="fw-bold text-success">{{ $asset->asset_symbol }}</div>
                                <small class="text-muted">{{ $asset->asset_name ?: 'Asset Name' }}</small>
                            </div>
                        </div>
                    </div>
                    @endforeach
                </div>
            </div>
            @empty
            <div class="text-center py-4">
                <i class="bi bi-exclamation-triangle display-4 text-warning"></i>
                <h5 class="mt-3">No Assets Found</h5>
                <p class="text-muted">This session has no saved assets.</p>
            </div>
            @endforelse
        </div>
    </div>





    <!-- Related Contests -->
    @if($contests->count() > 0)
    <div class="card shadow-sm border-0">
        <div class="card-header bg-gradient-warning text-white">
            <h5 class="mb-0"><i class="bi bi-trophy-fill me-2"></i>Related Contests ({{ $contests->count() }})</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>Contest Name</th>
                            <th>Category</th>
                            <th>Prize Pool</th>
                            <th>Entry Fee</th>
                            <th>Participants</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($contests as $contest)
                        <tr>
                            <td class="fw-semibold">{{ $contest->name }}</td>
                            <td>
                                <span class="badge bg-secondary">{{ $contest->category }}</span>
                            </td>
                            <td class="text-success fw-bold">{{ number_format($contest->prize_pool) }} probcoins</td>
                            <td class="text-primary">{{ number_format($contest->entry_fee) }} probcoins</td>
                            <td>
                                <span class="badge bg-info">{{ $contest->participants }}</span>
                            </td>
                            <td>
                                <span class="badge bg-{{ $contest->status === 'upcoming' ? 'info' : 'success' }}">
                                    {{ ucfirst($contest->status) }}
                                </span>
                            </td>
                        </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    @endif
</div>

<style>
.bg-gradient-success {
    background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
}

.bg-gradient-info {
    background: linear-gradient(135deg, #17a2b8 0%, #6f42c1 100%);
}

.bg-gradient-primary {
    background: linear-gradient(135deg, #007bff 0%, #6610f2 100%);
}

.bg-gradient-warning {
    background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%);
}

.card {
    border-radius: 15px;
    transition: all 0.3s ease;
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.1);
}

.alert {
    border-radius: 10px;
}

.badge {
    border-radius: 8px;
}

@keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}

.card {
    animation: fadeIn 0.5s ease-out;
}
</style>
@endsection

@section('scripts')
<script>
function refetchMissingPrices(sessionId) {
    const btn = event.target.closest('button');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Fetching...';

    fetch('/admin/league_sessions/' + sessionId + '/refetch-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': '{{ csrf_token() }}' }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            alert('✅ Done!\nFetched: ' + data.fetched + ' prices\n' + (data.failed.length ? 'Failed: ' + data.failed.join(', ') : 'All assets fetched successfully'));
            location.reload();
        } else {
            alert('Error: ' + data.message);
        }
    })
    .catch(e => alert('Error: ' + e.message))
    .finally(() => { btn.disabled = false; btn.innerHTML = orig; });
}
</script>
@endsection