@extends('admin.layouts.app')

@section('content')
<div class="container-fluid py-4">
    <div class="row mb-4">
        <div class="col-md-6">
            <h4 class="mb-0">Dashboard</h4>
            <small class="text-muted">{{ now()->format('M d, Y') }}</small>
        </div>
        <div class="col-md-6 text-end">
            <form method="GET" class="d-flex flex-wrap gap-2 justify-content-end">
                <input type="date" name="start_date" class="form-control form-control-sm" value="{{ request('start_date') }}" style="max-width: 150px;">
                <input type="date" name="end_date" class="form-control form-control-sm" value="{{ request('end_date') }}" style="max-width: 150px;">
                <button type="submit" class="btn btn-sm btn-primary">Filter</button>
                <a href="{{ route('admin.dashboard') }}" class="btn btn-sm btn-secondary">Reset</a>
            </form>
        </div>
    </div>

    <!-- Stats -->
    <div class="row g-3 mb-4">
        <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small class="text-muted d-block">Users</small>
                            <h3 class="mb-0">{{ number_format($userCount) }}</h3>
                        </div>
                        <div class="icon-box bg-primary">
                            <i class="bi bi-people"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small class="text-muted d-block">Withdrawals</small>
                            <h3 class="mb-0">{{ number_format($withdrawalRequestCount) }}</h3>
                        </div>
                        <div class="icon-box bg-danger">
                            <i class="bi bi-cash-coin"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small class="text-muted d-block">Cron Status</small>
                            <div class="d-flex align-items-center gap-2">
                                <span class="status-dot bg-{{ $cronStatus['is_running'] ? 'success' : 'danger' }}"></span>
                                <small class="text-{{ $cronStatus['is_running'] ? 'success' : 'danger' }} fw-bold">
                                    {{ $cronStatus['is_running'] ? 'Running' : 'Stopped' }}
                                </small>
                            </div>
                            <small class="text-muted" style="font-size: 0.7rem;">Last: {{ $cronStatus['last_run'] }}</small>
                        </div>
                        <div class="icon-box bg-secondary">
                            <i class="bi bi-clock-history"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small class="text-muted d-block">Stock API</small>
                            <div class="d-flex align-items-center gap-2">
                                <span class="status-dot bg-success"></span>
                                <small class="text-success fw-bold">Active</small>
                            </div>
                        </div>
                        <div class="icon-box bg-info">
                            <i class="bi bi-graph-up"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-6 col-md-3">
            <div class="card border-0 shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <small class="text-muted d-block">Crypto API</small>
                            <div class="d-flex align-items-center gap-2">
                                <span class="status-dot bg-success"></span>
                                <small class="text-success fw-bold">Active</small>
                            </div>
                        </div>
                        <div class="icon-box bg-warning">
                            <i class="bi bi-currency-bitcoin"></i>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <div class="row">
        <div class="col-lg-8 col-md-6 mb-4">
            <!-- Recent Transactions -->
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">Recent Transactions</h6>
                    <a href="{{ route('admin.transactions.index') }}" class="btn btn-sm btn-outline-primary">View All</a>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($recentTransactions as $transaction)
                                <tr>
                                    <td>{{ Str::limit($transaction->user->name, 20) }}</td>
                                    <td class="{{ $transaction->type === 'credit' ? 'text-success' : 'text-danger' }}">
                                        {{ $transaction->type === 'credit' ? '+' : '-' }}₹{{ number_format($transaction->amount, 2) }}
                                    </td>
                                    <td>
                                        <span class="badge bg-{{ $transaction->status === 'completed' ? 'success' : ($transaction->status === 'pending' ? 'warning' : 'danger') }}">
                                            {{ ucfirst($transaction->status) }}
                                        </span>
                                    </td>
                                    <td><small>{{ $transaction->created_at->format('M d, H:i') }}</small></td>
                                </tr>
                                @empty
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Recent Users -->
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center">
                    <h6 class="mb-0">Recent Users</h6>
                    <a href="{{ route('admin.users.index') }}" class="btn btn-sm btn-outline-primary">View All</a>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Phone</th>
                                    <th>Wallet</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                @forelse($recentUsers as $user)
                                <tr>
                                    <td><small>{{ Str::limit($user->name, 25) }}</small></td>
                                    <td><small>{{ Str::limit($user->email, 30) }}</small></td>
                                    <td><small>{{ $user->mobile ?? 'N/A' }}</small></td>
                                    <td><small>₹{{ number_format($user->wallet_balance ?? 0, 2) }}</small></td>
                                    <td><small>{{ $user->created_at->format('M d, Y') }}</small></td>
                                </tr>
                                @empty
                                @endforelse
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Quick Info -->
        <div class="col-lg-4 col-md-6 mb-4">
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-white border-0 py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <h6 class="mb-0">Contests</h6>
                    <div class="d-flex gap-2">
                        <form method="GET" class="d-inline">
                            <input type="hidden" name="start_date" value="{{ request('start_date') }}">
                            <input type="hidden" name="end_date" value="{{ request('end_date') }}">
                            <select name="contest_status" class="form-select form-select-sm" onchange="this.form.submit()" style="width: auto;">
                                <option value="">All</option>
                                <option value="upcoming" {{ request('contest_status') == 'upcoming' ? 'selected' : '' }}>Upcoming</option>
                                <option value="live" {{ request('contest_status') == 'live' ? 'selected' : '' }}>Live</option>
                                <option value="completed" {{ request('contest_status') == 'completed' ? 'selected' : '' }}>Completed</option>
                            </select>
                        </form>
                        <a href="{{ route('admin.contests.index') }}" class="btn btn-sm btn-outline-primary">View All</a>
                    </div>
                </div>
                <div class="card-body">
                    @foreach($recentContests as $contest)
                    <div class="mb-3 pb-3 border-bottom">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <small class="fw-bold d-block">{{ $contest->name ?? 'Contest #' . $contest->id }}</small>
                                <small class="text-muted">{{ $contest->participants_count ?? 0 }} participants</small>
                            </div>
                            <div class="text-end">
                                <small class="text-success d-block">₹{{ number_format($contest->prize_pool ?? 0) }}</small>
                                <span class="badge bg-{{ $contest->session_status == 'live' ? 'success' : ($contest->session_status == 'upcoming' ? 'warning' : 'secondary') }}" style="font-size: 0.65rem;">
                                    {{ ucfirst($contest->session_status) }}
                                </span>
                            </div>
                        </div>
                    </div>
                    @endforeach
                </div>
            </div>
        </div>
    </div>
</div>

<style>
.icon-box {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 1.5rem;
}
.card {
    border-radius: 12px;
}
.table thead th {
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    color: #6c757d;
    border-bottom: 2px solid #e9ecef;
}
.table tbody td {
    vertical-align: middle;
    padding: 1rem;
    word-break: break-word;
    max-width: 200px;
}
.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    animation: pulse 2s infinite;
}
@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
@media (max-width: 768px) {
    h3 {
        font-size: 1.5rem;
    }
    .icon-box {
        width: 40px;
        height: 40px;
        font-size: 1.2rem;
    }
    .table tbody td {
        padding: 0.75rem 0.5rem;
    }
    .table thead th {
        font-size: 0.75rem;
        padding: 0.75rem 0.5rem;
    }
}
</style>
@endsection

@section('title', 'Dashboard')
