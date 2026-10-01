@extends('admin.layouts.app')

@section('content')
<div class="min-vh-100" style="background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%);">
    <div class="container-fluid py-4">
        <!-- Header -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-body p-4">
                        <div class="d-flex justify-content-between align-items-center">
                            <div>
                                <h2 class="mb-1" style="color: #1565c0; font-weight: 700;">
                                    <i class="bi bi-arrow-left-right me-2"></i>Transaction Management
                                </h2>
                                <p class="text-muted mb-0">Monitor and manage all financial transactions</p>
                            </div>
                            <div class="text-end">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-outline-primary" style="border-radius: 12px;">
                                        <i class="bi bi-download me-1"></i>Export
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="row mb-4">
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-check-circle display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $transactions->where('status', 'completed')->count() }}</h3>
                        <p class="mb-0 opacity-75">Completed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-clock display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $transactions->where('status', 'pending')->count() }}</h3>
                        <p class="mb-0 opacity-75">Pending</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #f44336 0%, #c62828 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-x-circle display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">{{ $transactions->where('status', 'failed')->count() }}</h3>
                        <p class="mb-0 opacity-75">Failed</p>
                    </div>
                </div>
            </div>
            <div class="col-md-3 mb-3">
                <div class="card border-0 shadow-sm h-100" style="border-radius: 15px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%);">
                    <div class="card-body text-white text-center p-4">
                        <i class="bi bi-currency-rupee display-4 mb-3 opacity-75"></i>
                        <h3 class="mb-1">₹{{ number_format($transactions->sum('amount'), 2) }}</h3>
                        <p class="mb-0 opacity-75">Total Amount</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Filters -->
        <div class="row mb-4">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-funnel me-2"></i>Filter Transactions
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <form method="GET" class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label fw-semibold text-primary">Status</label>
                                <select name="status" class="form-select" style="border-radius: 12px;">
                                    <option value="">All Status</option>
                                    <option value="completed" {{ request('status') == 'completed' ? 'selected' : '' }}>Completed</option>
                                    <option value="pending" {{ request('status') == 'pending' ? 'selected' : '' }}>Pending</option>
                                    <option value="failed" {{ request('status') == 'failed' ? 'selected' : '' }}>Failed</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label fw-semibold text-primary">Type</label>
                                <select name="type" class="form-select" style="border-radius: 12px;">
                                    <option value="">All Types</option>
                                    <option value="deposit" {{ request('type') == 'deposit' ? 'selected' : '' }}>Deposit</option>
                                    <option value="withdrawal" {{ request('type') == 'withdrawal' ? 'selected' : '' }}>Withdrawal</option>
                                    <option value="refund" {{ request('type') == 'refund' ? 'selected' : '' }}>Refund</option>
                                    <option value="entry_fee" {{ request('type') == 'entry_fee' ? 'selected' : '' }}>Entry Fee</option>
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label fw-semibold text-primary">Search User</label>
                                <input type="text" name="search" class="form-control" style="border-radius: 12px;" placeholder="Search by name or email..." value="{{ request('search') }}">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label">&nbsp;</label>
                                <div class="d-flex gap-2">
                                    <button type="submit" class="btn" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border: none; border-radius: 10px; color: white; flex: 1;">
                                        <i class="bi bi-search me-1"></i>Filter
                                    </button>
                                    <a href="{{ route('admin.transactions.index') }}" class="btn btn-outline-secondary" style="border-radius: 10px;">
                                        <i class="bi bi-arrow-clockwise"></i>
                                    </a>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <!-- Transactions Table -->
        <div class="row">
            <div class="col-12">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <div class="d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 text-white" style="font-weight: 600;">
                                <i class="bi bi-list-ul me-2"></i>Transaction List
                            </h5>
                            <div class="text-white">
                                <small>{{ $transactions->total() }} total transactions</small>
                            </div>
                        </div>
                    </div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-hover mb-0">
                                <thead style="background: #f8f9fa;">
                                    <tr>
                                        <th class="border-0 py-3 px-4" style="font-weight: 600; color: #1565c0;">Transaction</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">User</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Amount</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Type</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Status</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Description</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Date</th>
                                        <th class="border-0 py-3" style="font-weight: 600; color: #1565c0;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @forelse($transactions as $transaction)
                                    <tr style="border-bottom: 1px solid #f0f0f0;">
                                        <td class="py-4 px-4">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar me-3" style="width: 40px; height: 40px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                                    <i class="bi bi-arrow-left-right text-white"></i>
                                                </div>
                                                <div>
                                                    <h6 class="mb-0" style="font-weight: 600;">#{{ $transaction->id }}</h6>
                                                    <small class="text-muted">Transaction ID</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="d-flex align-items-center">
                                                <div class="avatar me-2" style="width: 32px; height: 32px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;">
                                                    {{ strtoupper(substr($transaction->user->name, 0, 1)) }}
                                                </div>
                                                <div>
                                                    <h6 class="mb-0" style="font-weight: 600;">{{ $transaction->user->name }}</h6>
                                                    <small class="text-muted">{{ $transaction->user->email }}</small>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="text-center">
                                                <h6 class="mb-0 {{ $transaction->amount >= 0 ? 'text-success' : 'text-danger' }}" style="font-weight: 600;">
                                                    {{ $transaction->amount >= 0 ? '+' : '' }}₹{{ number_format($transaction->amount, 2) }}
                                                </h6>
                                                <small class="text-muted">{{ $transaction->amount >= 0 ? 'Credit' : 'Debit' }}</small>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            @php
                                                $typeStyles = [
                                                    'deposit' => ['bg' => '#e8f5e8', 'color' => '#2e7d32', 'icon' => 'arrow-down-circle'],
                                                    'withdrawal' => ['bg' => '#fff3cd', 'color' => '#856404', 'icon' => 'arrow-up-circle'],
                                                    'refund' => ['bg' => '#d1ecf1', 'color' => '#0c5460', 'icon' => 'arrow-clockwise'],
                                                    'entry_fee' => ['bg' => '#e3f2fd', 'color' => '#1565c0', 'icon' => 'credit-card']
                                                ];
                                                $style = $typeStyles[$transaction->type] ?? ['bg' => '#f8f9fa', 'color' => '#6c757d', 'icon' => 'circle'];
                                            @endphp
                                            <span class="badge" style="background: {{ $style['bg'] }}; color: {{ $style['color'] }}; border-radius: 8px; font-size: 0.8rem;">
                                                <i class="bi bi-{{ $style['icon'] }} me-1"></i>
                                                {{ ucfirst(str_replace('_', ' ', $transaction->type)) }}
                                            </span>
                                        </td>
                                        <td class="py-4">
                                            @php
                                                $statusStyles = [
                                                    'completed' => ['bg' => '#e8f5e8', 'color' => '#2e7d32', 'icon' => 'check-circle'],
                                                    'pending' => ['bg' => '#fff3cd', 'color' => '#856404', 'icon' => 'clock'],
                                                    'failed' => ['bg' => '#f8d7da', 'color' => '#721c24', 'icon' => 'x-circle']
                                                ];
                                                $statusStyle = $statusStyles[$transaction->status] ?? ['bg' => '#f8f9fa', 'color' => '#6c757d', 'icon' => 'circle'];
                                            @endphp
                                            <span class="badge" style="background: {{ $statusStyle['bg'] }}; color: {{ $statusStyle['color'] }}; border-radius: 8px; font-size: 0.8rem;">
                                                <i class="bi bi-{{ $statusStyle['icon'] }} me-1"></i>
                                                {{ ucfirst($transaction->status) }}
                                            </span>
                                        </td>
                                        <td class="py-4">
                                            <div style="max-width: 150px;">
                                                <span class="text-muted small">{{ Str::limit($transaction->description ?? 'No description', 30) }}</span>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div>
                                                <small class="text-muted">{{ $transaction->created_at->format('M d, Y') }}</small><br>
                                                <small class="text-muted">{{ $transaction->created_at->format('H:i A') }}</small>
                                            </div>
                                        </td>
                                        <td class="py-4">
                                            <div class="d-flex gap-1">
                                                <a href="{{ route('admin.transactions.show', $transaction->id) }}" class="btn btn-sm" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border: none; border-radius: 8px; color: white;" title="View Details">
                                                    <i class="bi bi-eye"></i>
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                    @empty
                                    <tr>
                                        <td colspan="8" class="text-center py-5">
                                            <div class="text-muted">
                                                <i class="bi bi-arrow-left-right display-4 mb-3 opacity-25"></i>
                                                <h5 class="text-muted">No transactions found</h5>
                                                <p class="mb-0">No transactions match your current filters.</p>
                                            </div>
                                        </td>
                                    </tr>
                                    @endforelse
                                </tbody>
                            </table>
                        </div>
                        
                        @if($transactions->hasPages())
                        <div class="card-footer border-0 py-4" style="background: #f8f9fa; border-radius: 0 0 20px 20px;">
                            <div class="d-flex justify-content-between align-items-center">
                                <div class="text-muted small">
                                    Showing {{ $transactions->firstItem() }} to {{ $transactions->lastItem() }} of {{ $transactions->total() }} results
                                </div>
                                <div>
                                    {{ $transactions->appends(request()->query())->links('pagination::bootstrap-4') }}
                                </div>
                            </div>
                        </div>
                        @endif
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection
