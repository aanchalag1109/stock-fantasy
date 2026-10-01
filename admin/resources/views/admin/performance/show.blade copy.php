@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1"><i class="bi bi-trophy text-warning me-2"></i>Contest #{{ $contest->id }} Performance</h1>
            <p class="text-muted mb-0">{{ $contest->category }} - {{ $contest->session_name }}</p>
        </div>
        <div>
            <span id="liveStatus" class="badge bg-success me-2">🔴 LIVE</span>
            <button id="startSessionBtn" class="btn btn-success btn-sm me-2" onclick="startSession()">
                <i class="bi bi-play-fill"></i> Start Session
            </button>
            <button id="endSessionBtn" class="btn btn-danger btn-sm me-2" onclick="endSession()">
                <i class="bi bi-stop-fill"></i> End Session
            </button>
            <a href="{{ route('admin.performance.index') }}" class="btn btn-outline-secondary">
                <i class="bi bi-arrow-left me-1"></i>Back to List
            </a>
        </div>
    </div>

    <!-- Live Profit/Loss Tracking -->
    <div class="row mb-4">
        <div class="col-md-8">
            <div class="card">
                <div class="card-header bg-dark text-white">
                    <h5 class="mb-0"><i class="bi bi-graph-up me-2"></i>Live Profit/Loss Tracking</h5>
                </div>
                <div class="card-body">
                    <canvas id="profitLossChart" height="100"></canvas>
                </div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="card">
                <div class="card-header bg-info text-white">
                    <h5 class="mb-0"><i class="bi bi-pie-chart me-2"></i>Performance Split</h5>
                </div>
                <div class="card-body">
                    <canvas id="performancePieChart" height="200"></canvas>
                </div>
            </div>
        </div>
    </div>

    <!-- Contest Overview -->
    <div class="row mb-4">
        <div class="col-md-2">
            <div class="card bg-primary text-white">
                <div class="card-body text-center text-white">
                    <h3 id="totalParticipants" class="text-white">{{ $stats['total_participants'] ?? 0 }}</h3>
                    <p class="mb-0 text-white">Total Participants</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-success text-white">
                <div class="card-body text-center text-white">
                    <h3 id="profitableUsers" class="text-white">{{ $stats['profitable_users'] ?? 0 }}</h3>
                    <p class="mb-0 text-white">In Profit</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-danger text-white">
                <div class="card-body text-center text-white">
                    <h3 id="lossUsers" class="text-white">{{ ($stats['total_participants'] ?? 0) - ($stats['profitable_users'] ?? 0) }}</h3>
                    <p class="mb-0 text-white">In Loss</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-warning text-white">
                <div class="card-body text-center text-white">
                    <h3 id="avgScore" class="text-white">{{ number_format($stats['avg_score'] ?? 0, 2) }}</h3>
                    <p class="mb-0 text-white">Avg Score</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-info text-white">
                <div class="card-body text-center text-white">
                    <h3 class="text-white">{{ $stats['start_prices_count'] ?? 0 }}</h3>
                    <p class="mb-0 text-white">Start Prices</p>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-secondary text-white">
                <div class="card-body text-center text-white">
                    <h3 class="text-white">{{ $stats['end_prices_count'] ?? 0 }}</h3>
                    <p class="mb-0 text-white">End Prices</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Prize Distribution -->
    <div class="card mb-4">
        <div class="card-header bg-warning text-dark">
            <h5 class="mb-0"><i class="bi bi-award-fill me-2"></i>Prize Distribution ({{ $stats['total_participants'] }} Participants)</h5>
        </div>
        <div class="card-body">
            @php
                $savedStructure = \App\Models\FlexibleStructure::where('contest_id', $contest->id)
                    ->orderBy('rank_start')
                    ->get();
            @endphp
            
            @if($savedStructure->count() > 0)
                <!-- Live Calculations -->
                <div class="row mb-4">
                    <div class="col-md-3">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h6 class="text-muted mb-1">Total Pool</h6>
                                <h5 class="text-primary mb-0">{{ $stats['total_participants'] * $contest->entry_fee }} probcoins</h5>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h6 class="text-muted mb-1">Platform Fee</h6>
                                <h5 class="text-danger mb-0">{{ floor(($stats['total_participants'] * $contest->entry_fee * $contest->platform_fee) / 100) }} probcoins</h5>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h6 class="text-muted mb-1">Prize Pool</h6>
                                <h5 class="text-success mb-0">{{ $stats['actual_prize_pool'] }} probcoins</h5>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card bg-light">
                            <div class="card-body text-center">
                                <h6 class="text-muted mb-1">Total Winners</h6>
                                <h5 class="text-info mb-0">{{ $stats['actual_winners'] }}</h5>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Saved Flexible Structure -->
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead class="table-dark">
                            <tr>
                                <th>Rank</th>
                                <th>Percentage</th>
                                <th>Prize Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($savedStructure as $group)
                                @php
                                    $groupPrize = floor(($stats['actual_prize_pool'] * $group->percentage) / 100);
                                @endphp
                                <tr>
                                    <td><span class="badge bg-warning text-dark fw-bold px-2 py-1">{{ $group->rank_label }}</span></td>
                                    <td><span class="text-primary fw-bold">{{ $group->percentage }}%</span></td>
                                    <td><strong class="text-success">{{ $groupPrize }} probcoins</strong></td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @else
                <div class="text-center py-4">
                    <i class="bi bi-info-circle display-4 text-muted"></i>
                    <h5 class="mt-3">No Flexible Structure Found</h5>
                    <p class="text-muted">Click "Get Structure" button to generate and save flexible prize distribution.</p>
                </div>
            @endif
        </div>
    </div>

    <!-- Live Price Section -->
    <div class="row mb-4">
        <div class="col-12">
            <div class="card">
                <div class="card-header bg-gradient-primary text-white d-flex justify-content-between align-items-center">
                    <h5 class="mb-0"><i class="bi bi-currency-exchange me-2"></i>Live Market Prices</h5>
                    <div>
                        <span id="priceUpdateTime" class="badge bg-light text-dark me-2">Last Updated: --:--</span>
                        <button class="btn btn-sm btn-success me-2" onclick="saveStartPrices()">
                            <i class="bi bi-play-fill"></i> Save Start Prices
                        </button>
                        <button class="btn btn-sm btn-danger me-2" onclick="saveEndPrices()">
                            <i class="bi bi-stop-fill"></i> Save End Prices
                        </button>
                        <button class="btn btn-sm btn-warning me-2" onclick="calculateResults()">
                            <i class="bi bi-calculator"></i> Calculate Results
                        </button>
                        <button class="btn btn-sm btn-info me-2" onclick="getFlexibleStructure()">
                            <i class="bi bi-gear"></i> Get Structure
                        </button>
                        <button class="btn btn-sm btn-outline-light" onclick="refreshPrices()">
                            <i class="bi bi-arrow-clockwise"></i> Refresh
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="row" id="livePricesContainer">
                        <!-- Live prices will be loaded here -->
                        <div class="col-12 text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading prices...</span>
                            </div>
                            <p class="mt-2 text-muted">Loading live market prices...</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <!-- Live Top Performers -->
        <div class="col-md-6 mb-4">
            <div class="card">
                <div class="card-header bg-warning text-dark">
                    <h5 class="mb-0"><i class="bi bi-award me-2"></i>Live Top 10</h5>
                </div>
                <div class="card-body p-0">
                    <div id="liveLeaderboard" style="max-height: 400px; overflow-y: auto;">
                        <!-- Live data will be populated here -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Price Tracking -->
        <div class="col-md-6 mb-4">
            <div class="card">
                <div class="card-header bg-success text-white d-flex justify-content-between">
                    <h5 class="mb-0"><i class="bi bi-graph-down me-2"></i>Start vs End Prices</h5>
                    <small>{{ $startPrices->count() }} Assets</small>
                </div>
                <div class="card-body" style="max-height: 400px; overflow-y: auto;">
                    @if($startPrices->count() > 0 || $endPrices->count() > 0)
                        <div class="table-responsive">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th>Asset</th>
                                        <th>Start Price</th>
                                        <th>Start Time</th>
                                        <th>End Price</th>
                                        <th>End Time</th>
                                        <th>Change</th>
                                        <th>% Change</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @php
                                        $allSymbols = collect($startPrices->keys())->merge($endPrices->keys())->unique();
                                    @endphp
                                    @foreach($allSymbols as $symbol)
                                        @php
                                            $startPrice = $startPrices->get($symbol);
                                            $endPrice = $endPrices->get($symbol);
                                            $startVal = $startPrice ? $startPrice->start_price : 0;
                                            $endVal = $endPrice ? $endPrice->end_price : 0;
                                            
                                            if ($startVal > 0 && $endVal > 0) {
                                                $change = $endVal - $startVal;
                                                $changePercent = (($endVal - $startVal) / $startVal) * 100;
                                                $changeClass = $change > 0 ? 'text-success' : ($change < 0 ? 'text-danger' : 'text-muted');
                                                $changeIcon = $change > 0 ? '↗' : ($change < 0 ? '↘' : '→');
                                            } else {
                                                $change = 0;
                                                $changePercent = 0;
                                                $changeClass = 'text-muted';
                                                $changeIcon = '→';
                                            }
                                        @endphp
                                        <tr>
                                            <td><strong>{{ $symbol }}</strong></td>
                                            <td>@php
                                                $isCrypto = strpos($symbol, '-USD') !== false || in_array(strtoupper($symbol), ['BTC', 'ETH', 'ADA', 'SOL', 'DOT', 'BNB', 'AVAX', 'BAT', 'ICP', 'SAND']);
                                                $currency = $isCrypto ? '$' : '₹';
                                                echo $currency . ($startVal > 0 ? number_format($startVal, $isCrypto ? 4 : 2) : 'N/A');
                                            @endphp</td>
                                            <td><small>{{ $startPrice ? date('M j, H:i', strtotime($startPrice->timestamp ?? $startPrice->created_at)) : 'N/A' }}</small></td>
                                            <td>@php
                                                echo $currency . ($endVal > 0 ? number_format($endVal, $isCrypto ? 4 : 2) : 'N/A');
                                            @endphp</td>
                                            <td><small>{{ $endPrice ? date('M j, H:i', strtotime($endPrice->timestamp ?? $endPrice->created_at)) : 'N/A' }}</small></td>
                                            <td class="{{ $changeClass }}">
                                                {{ $change != 0 ? ($change > 0 ? '+' : '') . number_format($change, $isCrypto ? 4 : 2) : 'N/A' }}
                                            </td>
                                            <td class="{{ $changeClass }} fw-bold">
                                                {{ $changeIcon }} {{ $changePercent != 0 ? number_format($changePercent, 2) . '%' : 'N/A' }}
                                            </td>
                                        </tr>
                                    @endforeach
                                </tbody>
                            </table>
                        </div>
                    @else
                        <div class="text-center py-4">
                            <i class="bi bi-exclamation-triangle display-4 text-warning"></i>
                            <h5 class="mt-3">No Price Data Available</h5>
                            <p class="text-muted">Start and end prices need to be added for this contest.</p>
                            <button class="btn btn-primary btn-sm" onclick="addSamplePrices()">
                                <i class="bi bi-plus-circle"></i> Add Sample Prices
                            </button>
                        </div>
                    @endif
                </div>
            </div>
        </div>
    </div>

    <!-- Full Leaderboard -->
    <div class="card">
        <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
            <h5 class="mb-0"><i class="bi bi-list-ol me-2"></i>Participants Overview</h5>
            @php $contestStatus = $contest->leagueSession->status ?? 'upcoming'; @endphp
            @if($contestStatus === 'live')
                <span class="badge bg-success">🔴 LIVE</span>
            @elseif($contestStatus === 'completed')
                <span class="badge bg-secondary">✅ COMPLETED</span>
            @else
                <span class="badge bg-warning text-dark">🟡 Waiting for Contest Start</span>
            @endif
        </div>
        <div class="card-body p-0">
            @forelse($groupedLeaderboard as $user)
                <!-- User Summary Card -->
                <div class="border-bottom">
                    <div class="p-4 bg-light">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <div class="d-flex align-items-center mb-3">
                                    <div class="avatar bg-primary text-white me-3" style="width: 50px; height: 50px; font-size: 1.2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                        {{ strtoupper(substr($user['user_name'] ?: 'U', 0, 1)) }}
                                    </div>
                                    <div>
                                        <h5 class="mb-1">{{ $user['user_name'] ?: 'User' }}</h5>
                                        <small class="text-muted">{{ $user['user_mobile'] }}</small>
                                    </div>
                                </div>
                                <div class="row text-center">
                                    <div class="col-3">
                                        <div class="border rounded p-2">
                                            <div class="fw-bold text-primary">{{ count($user['baskets']) }}</div>
                                            <small class="text-muted">Total Baskets</small>
                                        </div>
                                    </div>
                                    <div class="col-3">
                                        <div class="border rounded p-2">
                                            <div class="fw-bold text-success">{{ count($user['baskets']) }}</div>
                                            <small class="text-muted">Active</small>
                                        </div>
                                    </div>
                                    <div class="col-3">
                                        <div class="border rounded p-2">
                                            @php $bestBasket = collect($user['baskets'])->sortBy('individual_rank')->first(); @endphp
                                            <div class="fw-bold text-warning">#{{ $bestBasket['basket_id'] ?? 'N/A' }}</div>
                                            <small class="text-muted">Best Basket</small>
                                        </div>
                                    </div>
                                    <div class="col-3">
                                        <div class="border rounded p-2">
                                            @if($contestStatus === 'upcoming')
                                                <div class="fw-bold text-muted">—</div>
                                                <small class="text-muted">Not Ranked</small>
                                            @else
                                                <div class="fw-bold text-info">#{{ $user['best_rank'] ?? '—' }}</div>
                                                <small class="text-muted">Best Rank</small>
                                            @endif
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-4 text-end">
                                <div class="mb-2">
                                    <span class="badge bg-warning text-dark fs-6">{{ number_format($user['wallet_balance'] ?? 0, 2) }} coins</span>
                                </div>
                                <div class="mb-2">
                                    <span class="fw-bold text-{{ $user['total_calculated_score'] > 0 ? 'success' : 'danger' }} fs-5">
                                        {{ number_format($user['total_calculated_score'], 2) }}
                                    </span>
                                    <small class="text-muted d-block">Total Score</small>
                                </div>
                                <button class="btn btn-primary btn-sm" onclick="toggleUserBaskets({{ $user['user_id'] }})">
                                    <i class="bi bi-eye me-1"></i>View {{ count($user['baskets']) }} Baskets
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Basket Details (Hidden by default) -->
                    <div id="baskets-row-{{ $user['user_id'] }}" class="basket-details" style="display: none;">
                        <div class="p-3">
                            <div class="row">
                                @foreach($user['baskets'] as $basket)
                                    <div class="col-md-6 mb-3">
                                        <div class="card border-0 shadow-sm">
                                            <div class="card-header bg-white border-bottom">
                                                <div class="d-flex justify-content-between align-items-center">
                                                    <h6 class="mb-0 text-primary">Basket #{{ $basket['basket_id'] }}</h6>
                                                    @if($contestStatus === 'upcoming')
                                                        <span class="badge bg-light text-muted">Not Ranked</span>
                                                    @else
                                                        <span class="badge bg-{{ $basket['individual_rank'] == 1 ? 'warning' : ($basket['individual_rank'] <= 3 ? 'secondary' : 'light text-dark') }}">
                                                            @if($basket['individual_rank'] == 1) 🥇 @elseif($basket['individual_rank'] == 2) 🥈 @elseif($basket['individual_rank'] == 3) 🥉 @endif
                                                            Rank #{{ $basket['individual_rank'] }}
                                                        </span>
                                                    @endif
                                                </div>
                                            </div>
                                            <div class="card-body">
                                                <div class="d-flex justify-content-between align-items-center mb-2">
                                                    <span class="fw-bold text-{{ $basket['calculated_score'] > 0 ? 'success' : 'danger' }} fs-5">
                                                        {{ number_format($basket['calculated_score'], 2) }}
                                                    </span>
                                                    <small class="text-muted">Score</small>
                                                </div>
                                                <div class="mb-2">
                                                    @if($basket['assets'])
                                                        @foreach(array_slice($basket['assets'], 0, 3) as $asset)
                                                            <span class="badge bg-secondary me-1">{{ str_replace('-USD', '', $asset['symbol']) }}</span>
                                                        @endforeach
                                                        @if(count($basket['assets']) > 3)
                                                            <span class="badge bg-light text-dark">+{{ count($basket['assets']) - 3 }} more</span>
                                                        @endif
                                                    @else
                                                        <span class="text-muted">No assets</span>
                                                    @endif
                                                </div>
                                                <small class="text-muted">{{ date('M j, H:i', strtotime($basket['created_at'])) }}</small>
                                            </div>
                                        </div>
                                    </div>
                                @endforeach
                            </div>
                        </div>
                    </div>
                </div>
            @empty
                <div class="text-center py-5">
                    <i class="bi bi-people display-4 text-muted"></i>
                    <h5 class="mt-3">No Participants</h5>
                    <p class="text-muted">Contest participants will appear here once they join.</p>
                </div>
            @endforelse
        </div>
    </div>
</div>

<style>
.bg-gradient-primary {
    background: linear-gradient(45deg, #007bff, #0056b3) !important;
}
.card {
    transition: transform 0.2s;
}
.card:hover {
    transform: translateY(-2px);
}
</style>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
let profitLossChart, performancePieChart;
let profitLossData = [];
let timeLabels = [];

// Initialize Charts
function initCharts() {
    // Profit/Loss Line Chart
    const ctx1 = document.getElementById('profitLossChart').getContext('2d');
    profitLossChart = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Average Score',
                data: [],
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: true
                }
            }
        }
    });

    // Performance Pie Chart
    const ctx2 = document.getElementById('performancePieChart').getContext('2d');
    performancePieChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Profit', 'Loss'],
            datasets: [{
                data: [1, 1], // Start with dummy data
                backgroundColor: ['#28a745', '#dc3545']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Update live data
function updateLiveData() {
    fetch('{{ url("/admin/performance") }}/{{ $contest->id }}/live')
        .then(response => response.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            
            const now = new Date().toLocaleTimeString();
            let statusText = data.is_completed ? `✅ COMPLETED (${now})` : 
                           data.is_live ? `🔴 LIVE (${now})` : `⏳ UPCOMING (${now})`;
            let statusClass = data.is_completed ? 'badge bg-secondary me-2' : 
                            data.is_live ? 'badge bg-success me-2' : 'badge bg-warning me-2';
            
            document.getElementById('liveStatus').textContent = statusText;
            document.getElementById('liveStatus').className = statusClass;
            
            document.getElementById('totalParticipants').textContent = data.total_participants || 0;
            document.getElementById('profitableUsers').textContent = data.profitable_users || 0;
            document.getElementById('lossUsers').textContent = data.loss_users || 0;
            document.getElementById('avgScore').textContent = data.avg_score || '0.00';

            if (data.is_live) {
                timeLabels.push(now);
                profitLossData.push(data.avg_score || 0);
                
                if (timeLabels.length > 20) {
                    timeLabels.shift();
                    profitLossData.shift();
                }
                
                profitLossChart.data.labels = timeLabels;
                profitLossChart.data.datasets[0].data = profitLossData;
                profitLossChart.update();

                performancePieChart.data.datasets[0].data = [data.profitable_users || 0, data.loss_users || 0];
                performancePieChart.update();
            }

            let html = '';
            if (data.top_performers && data.top_performers.length > 0) {
                data.top_performers.forEach(p => {
                    const cls = p.profit_loss === 'profit' ? 'text-success' : 'text-danger';
                    const icon = p.profit_loss === 'profit' ? '📈' : '📉';
                    html += `<div class="d-flex justify-content-between p-3 border-bottom">
                        <div><span class="badge bg-primary me-2">#${p.rank}</span><strong>${p.name}</strong></div>
                        <div class="${cls}">${icon} <strong>${p.score}</strong></div>
                    </div>`;
                });
            } else {
                html = '<div class="p-3 text-center text-muted">No participants yet</div>';
            }
            document.getElementById('liveLeaderboard').innerHTML = html;
        })
        .catch(error => {
            document.getElementById('liveStatus').textContent = '🔴 ERROR';
            document.getElementById('liveStatus').className = 'badge bg-danger me-2';
            document.getElementById('liveLeaderboard').innerHTML = 
                '<div class="p-3 text-center text-danger">Error loading data: ' + error.message + '</div>';
        });
}

// Load live prices
function loadLivePrices() {
    fetch('{{ url("/api/live-prices") }}?contest_id={{ $contest->id }}')
        .then(response => response.json())
        .then(data => {
            if (data.stocks || data.crypto) {
                displayLivePrices(data);
                document.getElementById('priceUpdateTime').textContent = 
                    'Last Updated: ' + new Date().toLocaleTimeString();
            } else {
                document.getElementById('livePricesContainer').innerHTML = 
                    '<div class="col-12 text-center py-4"><div class="alert alert-warning">No live prices available for this contest</div></div>';
            }
        })
        .catch(error => {
            document.getElementById('livePricesContainer').innerHTML = 
                '<div class="col-12 text-center py-4"><div class="alert alert-danger">Error: ' + error.message + '</div></div>';
        });
}

// Display live prices
function displayLivePrices(data) {
    let html = '';
    
    // Show message if no assets in contest
    if ((!data.crypto || data.crypto.length === 0) && (!data.stocks || data.stocks.length === 0)) {
        html = '<div class="col-12 text-center py-4"><div class="alert alert-info"><i class="bi bi-info-circle me-2"></i>No assets found in this contest session</div></div>';
        document.getElementById('livePricesContainer').innerHTML = html;
        return;
    }
    
    // Crypto section
    if (data.crypto && data.crypto.length > 0) {
        html += '<div class="col-md-6 mb-3">';
        html += '<h6 class="text-primary mb-3"><i class="bi bi-currency-bitcoin me-2"></i>Cryptocurrencies (' + data.crypto.length + ')</h6>';
        html += '<div class="row">';
        data.crypto.forEach(price => {
            const changePercent = price.change_percent || 0;
            const changeClass = changePercent >= 0 ? 'text-success' : 'text-danger';
            const changeIcon = changePercent >= 0 ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>';
            const changeText = changePercent >= 0 ? 'INCREASE' : 'DECREASE';
            const changeBg = changePercent >= 0 ? 'bg-success' : 'bg-danger';
            
            // Handle missing assets
            if (price.missing) {
                html += `
                    <div class="col-lg-6 mb-2">
                        <div class="card border-warning shadow-sm">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="mb-1 fw-bold">${price.symbol}</h6>
                                        <small class="text-muted">${price.name}</small>
                                    </div>
                                    <div class="text-end">
                                        <div class="h6 mb-1 text-muted">Price N/A</div>
                                        <small class="badge bg-warning text-dark">NOT AVAILABLE</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div class="col-lg-6 mb-2">
                        <div class="card border-0 shadow-sm">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <h6 class="mb-1 fw-bold">${price.symbol}</h6>
                                        <small class="text-muted">${price.name}</small>
                                    </div>
                                    <div class="text-end">
                                        <div class="h6 mb-1">$${parseFloat(price.price).toFixed(4)}</div>
                                        <div class="${changeClass} fw-bold d-flex align-items-center justify-content-end">
                                            ${changeIcon}
                                            <span class="ms-1">${changePercent >= 0 ? '+' : ''}${parseFloat(changePercent).toFixed(2)}%</span>
                                        </div>
                                        <small class="badge ${changeBg} text-white">${changeText}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        html += '</div></div>';
    }
    
    // Stocks section
    if (data.stocks && data.stocks.length > 0) {
        html += '<div class="col-md-6 mb-3">';
        html += '<h6 class="text-success mb-3"><i class="bi bi-graph-up me-2"></i>Indian Stocks (' + data.stocks.length + ')</h6>';
        html += '<div class="row">';
        data.stocks.forEach(price => {
            const changePercent = price.change_percent || 0;
            const changeClass = changePercent >= 0 ? 'text-success' : 'text-danger';
            const changeIcon = changePercent >= 0 ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>';
            const changeText = changePercent >= 0 ? 'INCREASE' : 'DECREASE';
            const changeBg = changePercent >= 0 ? 'bg-success' : 'bg-danger';
            html += `
                <div class="col-lg-6 mb-2">
                    <div class="card border-0 shadow-sm">
                        <div class="card-body p-3">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <h6 class="mb-1 fw-bold">${price.symbol}</h6>
                                    <small class="text-muted">${price.name}</small>
                                </div>
                                <div class="text-end">
                                    <div class="h6 mb-1">₹${parseFloat(price.price).toFixed(2)}</div>
                                    <div class="${changeClass} fw-bold d-flex align-items-center justify-content-end">
                                        ${changeIcon}
                                        <span class="ms-1">${changePercent >= 0 ? '+' : ''}${parseFloat(changePercent).toFixed(2)}%</span>
                                    </div>
                                    <small class="badge ${changeBg} text-white">${changeText}</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div></div>';
    }
    
    document.getElementById('livePricesContainer').innerHTML = html;
}

// Refresh prices
function refreshPrices() {
    document.getElementById('livePricesContainer').innerHTML = 
        '<div class="col-12 text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 text-muted">Refreshing prices...</p></div>';
    loadLivePrices();
}

// Save start prices
function saveStartPrices() {
    if (!confirm('Save current live prices as START prices for contest {{ $contest->id }}?')) return;
    
    fetch('/api/save-start-prices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({ contest_id: {{ $contest->id }} })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => alert('Error: ' + error.message));
}

// Save end prices
function saveEndPrices() {
    if (!confirm('Save current live prices as END prices for contest {{ $contest->id }}?')) return;
    
    fetch('/api/save-end-prices', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({ contest_id: {{ $contest->id }} })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => alert('Error: ' + error.message));
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initCharts();
    updateLiveData();
    loadLivePrices();
    setInterval(updateLiveData, 5000);
    setInterval(loadLivePrices, 30000); // Refresh prices every 30 seconds
});

// Toggle user baskets
function toggleUserBaskets(userId) {
    const row = document.getElementById(`baskets-row-${userId}`);
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

// Toggle all asset details
function toggleAssetDetails() {
    const basketRows = document.querySelectorAll('.basket-details');
    const isAnyVisible = Array.from(basketRows).some(row => row.style.display !== 'none');
    basketRows.forEach(row => {
        row.style.display = isAnyVisible ? 'none' : 'table-row';
    });
}

// Start session
function startSession() {
    if (!confirm('Are you sure you want to start this session?')) return;
    
    const btn = document.getElementById('startSessionBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Starting...';
    
    fetch('{{ url("/admin/api/start-session") }}/{{ $contest->league_session_id }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Session started successfully!');
            location.reload();
        } else {
            alert('Error: ' + (data.message || 'Failed to start session'));
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-play-fill"></i> Start Session';
    });
}

// Add sample prices function
function addSamplePrices() {
    if (!confirm('Add sample start and end prices for this contest?')) return;
    
    fetch('{{ url("/api/add-sample-prices") }}/{{ $contest->id }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Sample prices added successfully!');
            location.reload();
        } else {
            alert('Error: ' + (data.message || 'Failed to add prices'));
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    });
}

// Calculate results
function calculateResults() {
    if (!confirm('Recalculate contest results based on current start/end prices?')) return;
    
    fetch('/api/calculate-results', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({ contest_id: {{ $contest->id }} })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            location.reload();
        } else {
            alert('Error: ' + data.error);
        }
    })
    .catch(error => alert('Error: ' + error.message));
}

// Get flexible structure
function getFlexibleStructure() {
    const totalWinners = {{ $stats['actual_winners'] ?? 0 }};
    
    if (totalWinners <= 0) {
        alert('No winners to create structure for');
        return;
    }
    
    if (!confirm(`Create flexible structure for ${totalWinners} winners?`)) return;
    
    // Generate structure data similar to contest-create-with-js.html
    const structureData = generateFlexibleStructure(totalWinners);
    
    fetch('/admin/api/save-flexible-structure', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        },
        body: JSON.stringify({
            winner_count: totalWinners,
            contest_id: {{ $contest->id }},
            structure_data: structureData
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Flexible structure saved successfully!');
            location.reload(); // Refresh page to show saved structure
        } else {
            alert('Error: ' + (data.error || 'Failed to save structure'));
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    });
}

// Load saved flexible structure from database
function loadSavedStructure() {
    fetch(`/admin/api/get-saved-structure/{{ $contest->id }}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success && data.structure.length > 0) {
            displaySavedStructure(data.structure);
        }
    })
    .catch(error => {
        console.log('No saved structure found:', error.message);
    });
}

// Display saved structure from database
function displaySavedStructure(structureData) {
    const totalParticipants = {{ $stats['total_participants'] ?? 10 }};
    const entryFee = {{ $contest->entry_fee ?? 50 }};
    const platformFeePercent = {{ $contest->platform_fee ?? 30 }};
    
    const totalPool = totalParticipants * entryFee;
    const platformFeeAmount = Math.floor((totalPool * platformFeePercent) / 100);
    const prizePool = totalPool - platformFeeAmount;
    
    let html = '<div class="alert alert-info mt-4">';
    html += '<h5><i class="bi bi-database me-2"></i>Saved Flexible Structure</h5>';
    
    html += '<div class="table-responsive">';
    html += '<table class="table table-hover table-sm">';
    html += '<thead class="table-dark">';
    html += '<tr><th>Rank</th><th>Percentage</th><th>Prize Amount</th></tr>';
    html += '</thead><tbody>';
    
    structureData.forEach(group => {
        const groupPrize = Math.floor((prizePool * group.percentage) / 100);
        html += '<tr>';
        html += '<td><span class="badge bg-secondary">' + group.rank_label + '</span></td>';
        html += '<td><span class="text-primary fw-bold">' + group.percentage + '%</span></td>';
        html += '<td><strong class="text-success">' + groupPrize + ' probcoins</strong></td>';
        html += '</tr>';
    });
    
    html += '</tbody></table></div></div>';
    
    // Insert after prize distribution section
    const prizeSection = document.querySelector('.card-body');
    if (prizeSection) {
        const existing = prizeSection.querySelector('.alert-info');
        if (existing) existing.remove();
        prizeSection.innerHTML += html;
    }
}

// Generate flexible structure based on winner count
function generateFlexibleStructure(totalWinners) {
    const prizeDistributionTable = {
        5: [{start: 1, end: 1, percent: 30}, {start: 2, end: 2, percent: 18}, {start: 3, end: 3, percent: 11}, {start: 4, end: 5, percent: 41}],
        10: [{start: 1, end: 1, percent: 30}, {start: 2, end: 2, percent: 18}, {start: 3, end: 3, percent: 11}, {start: 4, end: 5, percent: 13.5}, {start: 6, end: 10, percent: 27.5}],
        25: [{start: 1, end: 1, percent: 24}, {start: 2, end: 2, percent: 14}, {start: 3, end: 3, percent: 9}, {start: 4, end: 5, percent: 12.375}, {start: 6, end: 10, percent: 18.125}, {start: 11, end: 25, percent: 22.5}],
        50: [{start: 1, end: 1, percent: 23}, {start: 2, end: 2, percent: 13}, {start: 3, end: 3, percent: 9}, {start: 4, end: 5, percent: 8.1}, {start: 6, end: 10, percent: 15}, {start: 11, end: 25, percent: 16.4}, {start: 26, end: 50, percent: 15.5}],
        100: [{start: 1, end: 1, percent: 18}, {start: 2, end: 2, percent: 10}, {start: 3, end: 3, percent: 8}, {start: 4, end: 5, percent: 6.576}, {start: 6, end: 10, percent: 10}, {start: 11, end: 25, percent: 15.4}, {start: 26, end: 50, percent: 16.524}, {start: 51, end: 100, percent: 15.5}]
    };
    
    // Find closest structure
    const availableStructures = Object.keys(prizeDistributionTable).map(Number).sort((a,b)=>a-b);
    let chosenStructure = availableStructures[0];
    
    for (let structure of availableStructures) {
        if (structure <= totalWinners) {
            chosenStructure = structure;
        } else {
            break;
        }
    }
    
    const groups = prizeDistributionTable[chosenStructure] || [];
    
    // Adjust groups for actual winner count
    const adjustedGroups = [];
    for (let i = 0; i < groups.length; i++) {
        let g = {...groups[i]};
        if (g.start > totalWinners) continue;
        
        if (i === groups.length - 1) {
            g.end = totalWinners;
        } else {
            if (g.end > totalWinners) g.end = totalWinners;
        }
        adjustedGroups.push(g);
    }
    
    return adjustedGroups;
}

// Display flexible structure
function displayFlexibleStructure(structureData) {
    console.log('Structure Data:', structureData);
    
    // Calculate totals for display
    const totalWinners = {{ $stats['actual_winners'] ?? 5 }};
    const totalParticipants = {{ $stats['total_participants'] ?? 10 }};
    const entryFee = {{ $contest->entry_fee ?? 50 }};
    const platformFeePercent = {{ $contest->platform_fee ?? 30 }};
    
    const totalPool = totalParticipants * entryFee;
    const platformFeeAmount = Math.floor((totalPool * platformFeePercent) / 100);
    const prizePool = totalPool - platformFeeAmount;
    
    let html = '<div class="alert alert-success mt-4">';
    html += '<h5><i class="bi bi-check-circle me-2"></i>Flexible Structure Created Successfully!</h5>';
    
    // Live Calculations Display
    html += '<div class="row mb-3">';
    html += '<div class="col-md-3"><div class="card bg-light"><div class="card-body text-center">';
    html += '<h6 class="text-muted mb-1">Total Pool</h6>';
    html += `<h5 class="text-primary mb-0">${totalPool} probcoins</h5>`;
    html += '</div></div></div>';
    
    html += '<div class="col-md-3"><div class="card bg-light"><div class="card-body text-center">';
    html += '<h6 class="text-muted mb-1">Platform Fee</h6>';
    html += `<h5 class="text-danger mb-0">${platformFeeAmount} probcoins</h5>`;
    html += '</div></div></div>';
    
    html += '<div class="col-md-3"><div class="card bg-light"><div class="card-body text-center">';
    html += '<h6 class="text-muted mb-1">Prize Pool</h6>';
    html += `<h5 class="text-success mb-0">${prizePool} probcoins</h5>`;
    html += '</div></div></div>';
    
    html += '<div class="col-md-3"><div class="card bg-light"><div class="card-body text-center">';
    html += '<h6 class="text-muted mb-1">Total Winners</h6>';
    html += `<h5 class="text-info mb-0">${totalWinners}</h5>`;
    html += '</div></div></div>';
    html += '</div>';
    
    // Prize Distribution Table
    html += '<div class="table-responsive">';
    html += '<table class="table table-hover">';
    html += '<thead class="table-dark">';
    html += '<tr><th>Rank</th><th>Percentage</th><th>Winners</th><th>Prize per Winner</th><th>Total Prize</th></tr>';
    html += '</thead><tbody>';
    
    let totalPrizeCheck = 0;
    structureData.forEach(group => {
        const groupPrize = Math.floor((prizePool * group.percent) / 100);
        const winnersInGroup = group.end - group.start + 1;
        const perWinnerPrize = Math.floor(groupPrize / winnersInGroup);
        totalPrizeCheck += groupPrize;
        
        let rankLabel;
        if (group.start === group.end) {
            if (group.start === 1) rankLabel = '1st Prize';
            else if (group.start === 2) rankLabel = '2nd Prize';
            else if (group.start === 3) rankLabel = '3rd Prize';
            else rankLabel = `${group.start}th Prize`;
        } else {
            rankLabel = `Ranks ${group.start}-${group.end}`;
        }
        
        html += '<tr>';
        html += `<td><span class="badge bg-warning text-dark fw-bold px-2 py-1">${rankLabel}</span></td>`;
        html += `<td><span class="text-primary fw-bold">${group.percent}%</span></td>`;
        html += `<td><span class="badge bg-info text-white">${winnersInGroup} winners</span></td>`;
        html += `<td><strong class="text-success">${perWinnerPrize} probcoins</strong></td>`;
        html += `<td><strong class="text-primary">${groupPrize} probcoins</strong></td>`;
        html += '</tr>';
    });
    
    // Total row
    const totalPercent = structureData.reduce((sum, g) => sum + g.percent, 0);
    html += '</tbody><tfoot class="table-light">';
    html += '<tr class="fw-bold">';
    html += '<th>Total Prize Pool:</th>';
    html += `<th>${totalPercent}%</th>`;
    html += `<th>${totalWinners} winners</th>`;
    html += '<th>-</th>';
    html += `<th class="text-success">${totalPrizeCheck} probcoins</th>`;
    html += '</tr></tfoot></table></div></div>';
    
    // Print to console
    console.table(structureData);
    
    // Show alert with structure
    alert('Flexible Structure Created Successfully!\n\n' + 
          `Total Pool: ${totalPool} probcoins\n` +
          `Prize Pool: ${prizePool} probcoins\n` +
          `Total Winners: ${totalWinners}\n\n` +
          structureData.map(g => {
              const rankLabel = g.start === g.end ? 
                  (g.start === 1 ? '1st Prize' : g.start === 2 ? '2nd Prize' : g.start === 3 ? '3rd Prize' : `${g.start}th Prize`) :
                  `Ranks ${g.start}-${g.end}`;
              return `${rankLabel}: ${g.percent}%`;
          }).join('\n'));
    
    // Insert after prize distribution section
    const prizeSection = document.querySelector('.card-body');
    if (prizeSection) {
        // Remove any existing structure display
        const existing = prizeSection.querySelector('.alert-success');
        if (existing) existing.remove();
        
        prizeSection.insertAdjacentHTML('beforeend', html);
    }
}

// End session
function endSession() {
    if (!confirm('Are you sure you want to end this session? This action cannot be undone.')) return;
    
    const btn = document.getElementById('endSessionBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Ending...';
    
    fetch('{{ url("/admin/api/end-session") }}/{{ $contest->league_session_id }}', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': '{{ csrf_token() }}'
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('Session ended successfully!');
            location.reload();
        } else {
            alert('Error: ' + (data.message || 'Failed to end session'));
        }
    })
    .catch(error => {
        alert('Error: ' + error.message);
    })
    .finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-stop-fill"></i> End Session';
    });
}
</script>
@endsection