@extends('admin.layouts.app')

@section('content')
<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3 mb-0">Payment Orders</h1>
    </div>

    <!-- Filters -->
    <div class="card mb-3">
        <div class="card-body">
            <form method="GET" action="{{ route('admin.payments.index') }}" class="row g-3" id="filterForm">
                <div class="col-md-3">
                    <input type="text" name="search" class="form-control" placeholder="Search Order ID, User..." value="{{ request('search') }}" id="searchInput">
                </div>
                <div class="col-md-3">
                    <select name="status" class="form-select" id="statusSelect">
                        <option value="">All Status</option>
                        <option value="0" {{ request('status') === '0' ? 'selected' : '' }}>Pending</option>
                        <option value="1" {{ request('status') === '1' ? 'selected' : '' }}>Success</option>
                        <option value="4" {{ request('status') === '4' ? 'selected' : '' }}>Processing</option>
                        <option value="-1" {{ request('status') === '-1' ? 'selected' : '' }}>Failed</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <button type="submit" class="btn btn-primary">Filter</button>
                    <a href="{{ route('admin.payments.index') }}" class="btn btn-secondary">Reset</a>
                </div>
            </form>
        </div>
    </div>

    <!-- Payment List -->
    <div class="card">
        <div class="card-body">
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>User</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Updated</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($payments as $payment)
                        <tr>
                            <td><strong>{{ $payment->order_id }}</strong></td>
                            <td>
                                <div>{{ $payment->user_name ?? 'N/A' }}</div>
                                <small class="text-muted">{{ $payment->user_mobile ?? $payment->user_email }}</small>
                            </td>
                            <td><strong>₹{{ number_format($payment->amount, 2) }}</strong></td>
                            <td>
                                @if($payment->payment_status == 1)
                                    <span class="badge bg-success">Success</span>
                                @elseif($payment->payment_status == -1)
                                    <span class="badge bg-danger">Failed</span>
                                @elseif($payment->payment_status == 4)
                                    <span class="badge bg-warning">Processing</span>
                                @else
                                    <span class="badge bg-secondary">Pending</span>
                                @endif
                            </td>
                            <td>{{ \Carbon\Carbon::parse($payment->created_at)->format('d M Y, h:i A') }}</td>
                            <td>{{ \Carbon\Carbon::parse($payment->updated_at)->format('d M Y, h:i A') }}</td>
                            <td>
                                @if($payment->payment_status == 0)
                                    <form method="POST" action="{{ route('admin.payments.verify', $payment->id) }}" style="display:inline;">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-info">Verify</button>
                                    </form>
                                    <form method="POST" action="{{ route('admin.payments.approve', $payment->id) }}" style="display:inline;">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-success" onclick="return confirm('Approve this payment?')">Approve</button>
                                    </form>
                                    <form method="POST" action="{{ route('admin.payments.reject', $payment->id) }}" style="display:inline;">
                                        @csrf
                                        <button type="submit" class="btn btn-sm btn-danger" onclick="return confirm('Reject this payment?')">Reject</button>
                                    </form>
                                @else
                                    -
                                @endif
                            </td>
                        </tr>
                        @empty
                        <tr>
                            <td colspan="7" class="text-center">No payments found</td>
                        </tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
            
            <div class="d-flex justify-content-between align-items-center mt-3">
                <div>
                    <p class="text-muted mb-0">
                        Showing <strong>{{ $payments->firstItem() }}</strong> to <strong>{{ $payments->lastItem() }}</strong> of <strong>{{ $payments->total() }}</strong> results
                    </p>
                </div>
                <div>
                    {{ $payments->withQueryString()->links('pagination::bootstrap-5') }}
                </div>
            </div>
        </div>
    </div>
</div>

<script>
// Auto-submit on status change
document.getElementById('statusSelect')?.addEventListener('change', function() {
    document.getElementById('filterForm').submit();
});

// Submit on Enter key in search
document.getElementById('searchInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('filterForm').submit();
    }
});
</script>
@endsection
