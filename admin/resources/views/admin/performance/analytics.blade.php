@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="row mb-3">
        <div class="col-12">
            <a href="{{ route('admin.performance.show', $contest->id) }}" class="btn btn-secondary">
                <i class="bi bi-arrow-left"></i> Back to Performance
            </a>
        </div>
    </div>
    
    <div class="row mb-4">
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h6 class="text-muted">Total Participants</h6>
                    <h3 class="text-primary">{{ $stats['total_participants'] }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h6 class="text-muted">Total Pool</h6>
                    <h3 class="text-success">{{ number_format($stats['total_pool']) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h6 class="text-muted">Platform Fee</h6>
                    <h3 class="text-danger">{{ number_format($stats['platform_fee']) }}</h3>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h6 class="text-muted">Prize Pool</h6>
                    <h3 class="text-warning">{{ number_format($stats['prize_pool']) }}</h3>
                </div>
            </div>
        </div>
    </div>
    
    <div class="row mb-4">
        <div class="col-md-6">
            <div class="card">
                <div class="card-header bg-info text-white">
                    <h5 class="mb-0">Entry Transactions</h5>
                </div>
                <div class="card-body">
                    <h4>{{ $stats['total_entry_transactions'] }}</h4>
                    <p class="text-muted">Total Amount: {{ number_format($stats['total_entry_amount']) }} coins</p>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card">
                <div class="card-header bg-success text-white">
                    <h5 class="mb-0">Winning Transactions</h5>
                </div>
                <div class="card-body">
                    <h4>{{ $stats['total_winning_transactions'] }}</h4>
                    <p class="text-muted">Total Amount: {{ number_format($stats['total_winning_amount']) }} coins</p>
                </div>
            </div>
        </div>
    </div>
    
    <div class="card">
        <div class="card-header bg-primary text-white">
            <h5 class="mb-0">All Transactions ({{ $transactions->count() }})</h5>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Type</th>
                            <th class="text-end">Amount</th>
                            <th>Status</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($transactions as $trans)
                        <tr>
                            <td><small>{{ \Carbon\Carbon::parse($trans->created_at)->format('d M Y, h:i A') }}</small></td>
                            <td>
                                <div class="fw-bold">{{ $trans->user_name ?? 'User ' . $trans->user_id }}</div>
                                <small class="text-muted">{{ $trans->user_mobile ?? 'N/A' }}</small>
                            </td>
                            <td>
                                @if($trans->type == 'winnings')
                                    <span class="badge bg-success">Winnings</span>
                                @elseif($trans->type == 'contest_entry')
                                    <span class="badge bg-warning">Entry</span>
                                @else
                                    <span class="badge bg-secondary">{{ ucfirst($trans->type) }}</span>
                                @endif
                            </td>
                            <td class="text-end">
                                <span class="fw-bold {{ $trans->type == 'winnings' ? 'text-success' : 'text-danger' }}">
                                    {{ $trans->type == 'winnings' ? '+' : '-' }}{{ number_format($trans->amount, 2) }}
                                </span>
                            </td>
                            <td>
                                @if($trans->status == 'success')
                                    <span class="badge bg-success">Success</span>
                                @elseif($trans->status == 'pending')
                                    <span class="badge bg-warning">Pending</span>
                                @else
                                    <span class="badge bg-danger">Failed</span>
                                @endif
                            </td>
                            <td><small class="text-muted">{{ $trans->description ?? '-' }}</small></td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="6" class="text-center text-muted py-4">No transactions found</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
@endsection
