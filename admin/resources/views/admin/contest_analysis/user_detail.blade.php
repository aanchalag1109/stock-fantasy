@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2>👤 {{ $user->name }} - Contest History</h2>
        <a href="{{ route('admin.contest-analysis.users') }}" class="btn btn-secondary">← Back to Users</a>
    </div>

    <!-- User Info Card -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row">
                <div class="col-md-3">
                    <h6 class="text-muted">Mobile</h6>
                    <p class="mb-0"><strong>{{ $user->mobile }}</strong></p>
                </div>
                <div class="col-md-3">
                    <h6 class="text-muted">Email</h6>
                    <p class="mb-0">{{ $user->email }}</p>
                </div>
                <div class="col-md-3">
                    <h6 class="text-muted">Deposit Balance</h6>
                    <p class="mb-0"><strong>₹{{ number_format($user->deposit_balance ?? 0, 2) }}</strong></p>
                </div>
                <div class="col-md-3">
                    <h6 class="text-muted">Winnings Balance</h6>
                    <p class="mb-0"><strong class="text-success">₹{{ number_format($user->winnings_balance ?? 0, 2) }}</strong></p>
                </div>
            </div>
        </div>
    </div>

    <!-- Stats Cards -->
    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card bg-primary text-white">
                <div class="card-body text-center">
                    <h6>Total Contests</h6>
                    <h3>{{ $stats['total_contests'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-success text-white">
                <div class="card-body text-center">
                    <h6>Total Winnings</h6>
                    <h3>₹{{ number_format($stats['total_winnings'], 2) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card bg-warning text-white">
                <div class="card-body text-center">
                    <h6>Total Spent</h6>
                    <h3>₹{{ number_format($stats['total_spent'], 2) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card {{ $stats['net_profit'] >= 0 ? 'bg-info' : 'bg-danger' }} text-white">
                <div class="card-body text-center">
                    <h6>Net Profit/Loss</h6>
                    <h3>₹{{ number_format($stats['net_profit'], 2) }}</h3>
                </div>
            </div>
        </div>
    </div>

    <!-- Contests List -->
    <div class="card">
        <div class="card-header bg-primary text-white">
            <h5>Contest History</h5>
        </div>
        <div class="card-body">
            <!-- Date Filter -->
            <form method="GET" class="mb-3">
                <div class="row g-2">
                    <div class="col-md-4">
                        <input type="date" name="from_date" class="form-control" placeholder="From Date" value="{{ request('from_date') }}">
                    </div>
                    <div class="col-md-4">
                        <input type="date" name="to_date" class="form-control" placeholder="To Date" value="{{ request('to_date') }}">
                    </div>
                    <div class="col-md-4">
                        <button type="submit" class="btn btn-primary">Filter</button>
                        <a href="{{ route('admin.contest-analysis.user', $user->id) }}" class="btn btn-secondary">Clear</a>
                    </div>
                </div>
            </form>
            @if($contestsData->isEmpty())
                <div class="alert alert-info">No contests played yet</div>
            @else
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Contest ID</th>
                                <th>Session</th>
                                <th>Category</th>
                                <th>Entry Fee</th>
                                <th>Rank</th>
                                <th>Score</th>
                                <th>Winning</th>
                                <th>Date</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach($contestsData as $contest)
                            <tr class="{{ $contest['winning'] > 0 ? 'table-success' : '' }}">
                                <td><strong>#{{ $contest['contest_id'] }}</strong></td>
                                <td>{{ $contest['session_name'] }}</td>
                                <td><span class="badge bg-info">{{ $contest['category'] }}</span></td>
                                <td>₹{{ $contest['entry_fee'] }}</td>
                                <td>
                                    @if($contest['rank'] == 1)
                                        🥇 1
                                    @elseif($contest['rank'] == 2)
                                        🥈 2
                                    @elseif($contest['rank'] == 3)
                                        🥉 3
                                    @else
                                        {{ $contest['rank'] }}
                                    @endif
                                </td>
                                <td>{{ number_format($contest['score'], 2) }}</td>
                                <td>
                                    @if($contest['winning'] > 0)
                                        <strong class="text-success">₹{{ number_format($contest['winning'], 2) }}</strong>
                                    @else
                                        <span class="text-muted">-</span>
                                    @endif
                                </td>
                                <td>{{ \Carbon\Carbon::parse($contest['created_at'])->format('d M Y') }}</td>
                                <td>
                                    <a href="{{ route('admin.contest-analysis.contest', $contest['contest_id']) }}" class="btn btn-sm btn-primary">
                                        View Contest
                                    </a>
                                </td>
                            </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endif
        </div>
    </div>
</div>
@endsection
