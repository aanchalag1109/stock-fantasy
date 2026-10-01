@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>🏆 Contest #{{ $contest->id }} - Full Analysis</h2>
        <a href="{{ route('admin.contest-analysis.session', $contest->league_session_id) }}" class="btn btn-secondary">← Back</a>
    </div>

    <!-- Stats Cards -->
    <div class="row mb-4">
        <div class="col-md-2">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h6>Total Players</h6>
                    <h3>{{ $stats['total_players'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h6>Winners</h6>
                    <h3>{{ $stats['winners_count'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-info text-white">
                <div class="card-body text-center">
                    <h6>Entry Fee</h6>
                    <h3>₹{{ $stats['entry_fee'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-warning text-white">
                <div class="card-body text-center">
                    <h6>Total Pool</h6>
                    <h3>₹{{ number_format($stats['total_pool'], 2) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-2">
            <div class="card bg-danger text-white">
                <div class="card-body text-center">
                    <h6>Distributed</h6>
                    <h3>₹{{ number_format($stats['total_prize_distributed'], 2) }}</h3>
                </div>
            </div>
        </div>
    </div>

    <!-- Prize Structure -->
    <div class="card mb-4">
        <div class="card-header bg-primary text-white">
            <h5>💰 Prize Structure</h5>
        </div>
        <div class="card-body">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Rank Range</th>
                        <th>Winners</th>
                        <th>Percentage</th>
                        <th>Per Winner</th>
                        <th>Total Prize</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($prizeStructure as $prize)
                    <tr>
                        <td><strong>{{ $prize->rank_label }}</strong></td>
                        <td>{{ $prize->winners_count }}</td>
                        <td>{{ $prize->percentage }}%</td>
                        <td>₹{{ number_format($prize->per_winner_amount, 2) }}</td>
                        <td>₹{{ number_format($prize->prize_amount, 2) }}</td>
                    </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    </div>

    <div class="row">
        <!-- Leaderboard -->
        <div class="col-md-6">
            <div class="card">
                <div class="card-header bg-success text-white">
                    <h5>🏅 Leaderboard</h5>
                </div>
                <div class="card-body">
                    <!-- User Filter -->
                    <form method="GET" class="mb-3">
                        <div class="row g-2">
                            <div class="col-md-8">
                                <select name="user_id" class="form-select">
                                    <option value="">All Users</option>
                                    @foreach($leaderboard as $entry)
                                        <option value="{{ $entry->user_id }}" {{ request('user_id') == $entry->user_id ? 'selected' : '' }}>
                                            {{ $entry->name ?? 'User '.$entry->user_id }} ({{ $entry->mobile }})
                                        </option>
                                    @endforeach
                                </select>
                            </div>
                            <div class="col-md-4">
                                <button type="submit" class="btn btn-primary">Filter</button>
                                <a href="{{ route('admin.contest-analysis.contest', $contest->id) }}" class="btn btn-secondary">Clear</a>
                            </div>
                        </div>
                    </form>
                    
                    <div style="max-height: 500px; overflow-y: auto;">
                        <table class="table table-sm table-hover">
                            <thead class="sticky-top bg-white">
                                <tr>
                                    <th>Rank</th>
                                    <th>User</th>
                                    <th>Mobile</th>
                                    <th>Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($leaderboard as $entry)
                                <tr class="{{ $entry->rank <= $stats['winners_count'] ? 'table-success' : '' }}">
                                    <td>
                                        @if($entry->rank == 1)
                                            🥇
                                        @elseif($entry->rank == 2)
                                            🥈
                                        @elseif($entry->rank == 3)
                                            🥉
                                        @else
                                            {{ $entry->rank }}
                                        @endif
                                    </td>
                                    <td>{{ $entry->name ?? 'User '.$entry->user_id }}</td>
                                    <td>{{ $entry->mobile }}</td>
                                    <td>{{ number_format($entry->total_score, 2) }}</td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Winning Transactions -->
        <div class="col-md-6">
            <div class="card">
                <div class="card-header bg-warning text-white">
                    <h5>💸 Winning Transactions</h5>
                </div>
                <div class="card-body" style="max-height: 500px; overflow-y: auto;">
                    @if($winningTransactions->isEmpty())
                        <div class="alert alert-info">No winning transactions yet</div>
                    @else
                        <table class="table table-sm table-hover">
                            <thead class="sticky-top bg-white">
                                <tr>
                                    <th>User</th>
                                    <th>Amount</th>
                                    <th>Description</th>
                                    <th>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($winningTransactions as $txn)
                                <tr>
                                    <td>
                                        <strong>{{ $txn->name ?? 'N/A' }}</strong><br>
                                        <small>{{ $txn->mobile }}</small>
                                    </td>
                                    <td><strong class="text-success">₹{{ number_format($txn->amount, 2) }}</strong></td>
                                    <td><small>{{ $txn->description }}</small></td>
                                    <td><small>{{ \Carbon\Carbon::parse($txn->created_at)->format('d M, h:i A') }}</small></td>
                                </tr>
                                @endforeach
                            </tbody>
                        </table>
                    @endif
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.sticky-top {
    position: sticky;
    top: 0;
    z-index: 10;
}
</style>
@endsection
