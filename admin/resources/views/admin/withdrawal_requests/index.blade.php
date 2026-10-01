@extends('admin.layouts.app')
@section('content')
<div class="container-fluid py-4">
    <h3 class="mb-4"><i class="bi bi-cash-coin text-warning me-2"></i>Withdrawal Requests (USDT)</h3>
    <div class="card border-0 shadow-sm">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover mb-0">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th>
                            <th>User</th>
                            <th>Amount</th>
                            <th>Network</th>
                            <th>USDT Address</th>
                            <th>Status</th>
                            <th>Requested</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        @forelse($requests as $request)
                        <tr>
                            <td>{{ $request->id }}</td>
                            <td>{{ $request->user->name ?? 'N/A' }}</td>
                            <td class="fw-bold">{{ number_format($request->amount, 0) }}</td>
                            <td><span class="badge bg-info">{{ $request->usdt_network ?? '-' }}</span></td>
                            <td><small class="font-monospace">{{ $request->usdt_wallet_address ? Str::limit($request->usdt_wallet_address, 18) : '-' }}</small></td>
                            <td>
                                @php $sc = ['pending'=>'warning','accepted'=>'success','rejected'=>'danger']; @endphp
                                <span class="badge bg-{{ $sc[$request->status] ?? 'secondary' }}">{{ ucfirst($request->status) }}</span>
                            </td>
                            <td><small>{{ $request->created_at->format('d M, H:i') }}</small></td>
                            <td>
                                <a href="{{ route('admin.withdrawal_requests.show', $request->id) }}" class="btn btn-sm btn-primary">
                                    <i class="bi bi-eye"></i> View
                                </a>
                            </td>
                        </tr>
                        @empty
                        <tr><td colspan="8" class="text-center py-4 text-muted">No withdrawal requests yet.</td></tr>
                        @endforelse
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>
@endsection
