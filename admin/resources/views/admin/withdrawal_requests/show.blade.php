@extends('admin.layouts.app')
@section('content')
<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="mb-0"><i class="bi bi-cash-coin text-warning me-2"></i>Withdrawal Request #{{ $request->id }}</h3>
        <a href="{{ route('admin.withdrawal_requests.index') }}" class="btn btn-outline-secondary btn-sm">
            <i class="bi bi-arrow-left me-1"></i>Back to List
        </a>
    </div>

    <div class="row">
        <!-- LEFT: User + Request Details -->
        <div class="col-lg-7">

            {{-- User Details --}}
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-primary text-white"><i class="bi bi-person-fill me-2"></i>User Details</div>
                <div class="card-body">
                    @php $user = $request->user; @endphp
                    @if($user)
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Name</label>
                            <div class="fw-semibold fs-5">{{ $user->name ?? 'N/A' }}</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Mobile</label>
                            <div class="fw-semibold">{{ $user->mobile ?? 'N/A' }}</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Email</label>
                            <div class="fw-semibold">{{ $user->email ?? 'N/A' }}</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">User ID</label>
                            <div class="fw-semibold">#{{ $user->id }}</div>
                        </div>
                        <div class="col-md-4 mb-2">
                            <div class="p-3 bg-light rounded text-center">
                                <small class="text-muted d-block">Deposit Balance</small>
                                <strong class="text-success">{{ number_format($user->deposit_balance ?? 0, 0) }}</strong>
                            </div>
                        </div>
                        <div class="col-md-4 mb-2">
                            <div class="p-3 bg-light rounded text-center">
                                <small class="text-muted d-block">Winnings Balance</small>
                                <strong class="text-warning">{{ number_format($user->winnings_balance ?? 0, 0) }}</strong>
                            </div>
                        </div>
                        <div class="col-md-4 mb-2">
                            <div class="p-3 bg-light rounded text-center">
                                <small class="text-muted d-block">Total Balance</small>
                                <strong class="text-primary">{{ number_format(($user->deposit_balance ?? 0) + ($user->winnings_balance ?? 0), 0) }}</strong>
                            </div>
                        </div>
                    </div>
                    @else
                        <p class="text-muted">User not found</p>
                    @endif
                </div>
            </div>

            {{-- Request Details --}}
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-warning text-white"><i class="bi bi-info-circle me-2"></i>Request Details</div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Amount</label>
                            <div class="fw-bold fs-4 text-danger">{{ number_format($request->amount, 0) }} coins</div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Status</label>
                            <div>
                                @php $sc = ['pending'=>'warning','accepted'=>'success','rejected'=>'danger']; @endphp
                                <span class="badge bg-{{ $sc[$request->status] ?? 'secondary' }} fs-6">
                                    {{ ucfirst($request->status) }}
                                </span>
                            </div>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label class="text-muted small">Requested At</label>
                            <div class="fw-semibold">{{ $request->created_at->format('d M Y, h:i A') }}</div>
                        </div>
                        @if($request->admin_message)
                        <div class="col-12 mb-3">
                            <label class="text-muted small">Admin Message</label>
                            <div class="fw-semibold">{{ $request->admin_message }}</div>
                        </div>
                        @endif
                    </div>
                </div>
            </div>

            {{-- USDT Details --}}
            <div class="card border-0 shadow-sm mb-4 border-warning">
                <div class="card-header bg-warning text-white"><i class="bi bi-wallet2 me-2"></i>USDT Payout Details</div>
                <div class="card-body">
                    @php
                        $pd = \DB::table('user_payment_details')->where('user_id', $request->user_id)->first();
                        $usdtAddr = $request->usdt_wallet_address ?? ($pd->usdt_wallet_address ?? null);
                        $usdtNet  = $request->usdt_network ?? ($pd->usdt_network ?? 'BEP20');
                    @endphp
                    @if($usdtAddr)
                        <div class="mb-3">
                            <label class="text-muted small">Network</label>
                            <div><span class="badge bg-info fs-6">{{ $usdtNet }}</span></div>
                        </div>
                        <div class="mb-3">
                            <label class="text-muted small">USDT Wallet Address</label>
                            <div class="input-group mt-1">
                                <input type="text" class="form-control font-monospace" id="usdtAddr" value="{{ $usdtAddr }}" readonly>
                                <button class="btn btn-outline-secondary" type="button"
                                    onclick="navigator.clipboard.writeText('{{ $usdtAddr }}'); this.innerHTML='<i class=\'bi bi-check\'></i> Copied'; setTimeout(()=>this.innerHTML='<i class=\'bi bi-clipboard\'></i> Copy',2000)">
                                    <i class="bi bi-clipboard"></i> Copy
                                </button>
                            </div>
                        </div>
                        <div class="alert alert-warning border-0 mb-0">
                            <i class="bi bi-exclamation-triangle me-2"></i>
                            Send <strong>{{ number_format($request->amount, 0) }} coins worth USDT</strong> on <strong>{{ $usdtNet }}</strong> network only.
                        </div>
                    @else
                        <div class="alert alert-danger mb-0">
                            <i class="bi bi-exclamation-circle me-2"></i>User has not added USDT wallet details.
                        </div>
                    @endif
                </div>
            </div>
        </div>

        <!-- RIGHT: Action -->
        <div class="col-lg-5">
            @if($request->status === 'pending')
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-header bg-dark text-white"><i class="bi bi-check2-circle me-2"></i>Take Action</div>
                <div class="card-body">
                    <form method="POST" action="{{ route('admin.withdrawal_requests.update', $request->id) }}">
                        @csrf
                        @method('PUT')
                        <div class="mb-4">
                            <label class="form-label fw-semibold">Message to User (optional)</label>
                            <textarea name="admin_message" class="form-control" rows="3"
                                placeholder="e.g. Payment sent via BEP20, TxID: 0x..."></textarea>
                        </div>
                        <div class="d-grid gap-2">
                            <button type="submit" name="status" value="accepted"
                                class="btn btn-success btn-lg"
                                onclick="return confirm('Mark this withdrawal as ACCEPTED? Make sure you have sent the USDT payment first.')">
                                <i class="bi bi-check-circle-fill me-2"></i>Accept & Mark as Paid
                            </button>
                            <button type="submit" name="status" value="rejected"
                                class="btn btn-danger btn-lg"
                                onclick="return confirm('Reject this withdrawal? Amount will be refunded to user wallet.')">
                                <i class="bi bi-x-circle-fill me-2"></i>Reject & Refund
                            </button>
                        </div>
                        <small class="text-muted d-block mt-3">
                            <i class="bi bi-info-circle me-1"></i>
                            Rejecting will automatically refund {{ number_format($request->amount, 0) }} coins to user's winnings balance.
                        </small>
                    </form>
                </div>
            </div>
            @else
            <div class="card border-0 shadow-sm mb-4">
                <div class="card-body text-center py-5">
                    @if($request->status === 'accepted')
                        <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
                        <h5 class="mt-3 text-success">Withdrawal Accepted</h5>
                        <p class="text-muted">Payment has been processed.</p>
                    @else
                        <i class="bi bi-x-circle-fill text-danger" style="font-size:3rem"></i>
                        <h5 class="mt-3 text-danger">Withdrawal Rejected</h5>
                        <p class="text-muted">Amount has been refunded to user.</p>
                    @endif
                </div>
            </div>
            @endif

            {{-- Quick Stats --}}
            <div class="card border-0 shadow-sm">
                <div class="card-header bg-light"><i class="bi bi-graph-up me-2"></i>User Withdrawal History</div>
                <div class="card-body p-0">
                    @php
                        $history = \DB::table('withdrawal_requests')
                            ->where('user_id', $request->user_id)
                            ->orderByDesc('created_at')
                            ->limit(5)
                            ->get();
                    @endphp
                    <div class="table-responsive">
                        <table class="table table-sm mb-0">
                            <thead class="table-light">
                                <tr><th>Amount</th><th>Status</th><th>Date</th></tr>
                            </thead>
                            <tbody>
                                @foreach($history as $h)
                                <tr class="{{ $h->id == $request->id ? 'table-warning' : '' }}">
                                    <td class="fw-semibold">{{ number_format($h->amount, 0) }}</td>
                                    <td>
                                        @php $sc2 = ['pending'=>'warning','accepted'=>'success','rejected'=>'danger']; @endphp
                                        <span class="badge bg-{{ $sc2[$h->status] ?? 'secondary' }}">{{ ucfirst($h->status) }}</span>
                                    </td>
                                    <td><small>{{ \Carbon\Carbon::parse($h->created_at)->format('d M, H:i') }}</small></td>
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
@endsection
