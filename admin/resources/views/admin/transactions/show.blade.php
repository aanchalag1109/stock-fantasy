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
                                    <i class="bi bi-receipt me-2"></i>Transaction #{{ $transaction->id }}
                                </h2>
                                <p class="text-muted mb-0">Complete transaction details and information</p>
                            </div>
                            <div>
                                <a href="{{ route('admin.transactions.index') }}" class="btn btn-outline-primary" style="border-radius: 12px;">
                                    <i class="bi bi-arrow-left me-1"></i>Back to List
                                </a>
                                @if(in_array($transaction->type, ['deposit', 'withdrawal']) && $transaction->status === 'pending')
                                <form action="{{ route('admin.transactions.approve', $transaction->id) }}" method="POST" class="d-inline ms-2">
                                    @csrf
                                    <button type="submit" class="btn btn-success" style="border-radius: 12px;" onclick="return confirm('Are you sure you want to approve this transaction?')">
                                        <i class="bi bi-check-circle me-1"></i>Approve
                                    </button>
                                </form>
                                <form action="{{ route('admin.transactions.reject', $transaction->id) }}" method="POST" class="d-inline ms-2">
                                    @csrf
                                    <button type="submit" class="btn btn-danger" style="border-radius: 12px;" onclick="return confirm('Are you sure you want to reject this transaction?')">
                                        <i class="bi bi-x-circle me-1"></i>Reject
                                    </button>
                                </form>
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <!-- Transaction Details -->
            <div class="col-lg-8 mb-4">
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-info-circle me-2"></i>Transaction Details
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="row g-4">
                            <div class="col-md-6">
                                <div class="d-flex align-items-center mb-3">
                                    <div class="avatar me-3" style="width: 50px; height: 50px; background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                        <i class="bi bi-person text-white fs-4"></i>
                                    </div>
                                    <div>
                                        <h6 class="mb-0" style="font-weight: 600;">{{ $transaction->user->name }}</h6>
                                        <small class="text-muted">{{ $transaction->user->email }}</small><br>
                                        <small class="text-muted">User ID: {{ $transaction->user_id }}</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="text-end">
                                    <h3 class="mb-1 {{ $transaction->amount >= 0 ? 'text-success' : 'text-danger' }}" style="font-weight: 700;">
                                        {{ $transaction->amount >= 0 ? '+' : '' }}₹{{ number_format($transaction->amount, 2) }}
                                    </h3>
                                    <small class="text-muted">{{ $transaction->amount >= 0 ? 'Credit' : 'Debit' }} Amount</small>
                                </div>
                            </div>
                        </div>
                        
                        <hr class="my-4">
                        
                        <div class="row g-4">
                            <div class="col-md-6">
                                <div class="info-item">
                                    <label class="form-label fw-semibold text-primary mb-1">Transaction Type</label>
                                    @php
                                        $typeStyles = [
                                            'deposit' => ['bg' => '#e8f5e8', 'color' => '#2e7d32', 'icon' => 'arrow-down-circle'],
                                            'withdrawal' => ['bg' => '#fff3cd', 'color' => '#856404', 'icon' => 'arrow-up-circle'],
                                            'refund' => ['bg' => '#d1ecf1', 'color' => '#0c5460', 'icon' => 'arrow-clockwise'],
                                            'entry_fee' => ['bg' => '#e3f2fd', 'color' => '#1565c0', 'icon' => 'credit-card']
                                        ];
                                        $style = $typeStyles[$transaction->type] ?? ['bg' => '#f8f9fa', 'color' => '#6c757d', 'icon' => 'circle'];
                                    @endphp
                                    <div>
                                        <span class="badge fs-6 px-3 py-2" style="background: {{ $style['bg'] }}; color: {{ $style['color'] }}; border-radius: 10px;">
                                            <i class="bi bi-{{ $style['icon'] }} me-2"></i>
                                            {{ ucfirst(str_replace('_', ' ', $transaction->type)) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="info-item">
                                    <label class="form-label fw-semibold text-primary mb-1">Status</label>
                                    @php
                                        $statusStyles = [
                                            'success' => ['bg' => '#e8f5e8', 'color' => '#2e7d32', 'icon' => 'check-circle'],
                                            'pending' => ['bg' => '#fff3cd', 'color' => '#856404', 'icon' => 'clock'],
                                            'failed' => ['bg' => '#f8d7da', 'color' => '#721c24', 'icon' => 'x-circle']
                                        ];
                                        $statusStyle = $statusStyles[$transaction->status] ?? ['bg' => '#f8f9fa', 'color' => '#6c757d', 'icon' => 'circle'];
                                    @endphp
                                    <div>
                                        <span class="badge fs-6 px-3 py-2" style="background: {{ $statusStyle['bg'] }}; color: {{ $statusStyle['color'] }}; border-radius: 10px;">
                                            <i class="bi bi-{{ $statusStyle['icon'] }} me-2"></i>
                                            {{ ucfirst($transaction->status) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="info-item">
                                    <label class="form-label fw-semibold text-primary mb-1">Payment Method</label>
                                    <p class="mb-0">{{ $transaction->payment_method ?? 'Not specified' }}</p>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="info-item">
                                    <label class="form-label fw-semibold text-primary mb-1">Transaction ID</label>
                                    <p class="mb-0 font-monospace">{{ $transaction->transaction_id ?? 'Not available' }}</p>
                                </div>
                            </div>
                            @if($transaction->description)
                            <div class="col-12">
                                <div class="info-item">
                                    <label class="form-label fw-semibold text-primary mb-1">Description</label>
                                    <p class="mb-0">{{ $transaction->description }}</p>
                                </div>
                            </div>
                            @endif
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Timeline & Info -->
            <div class="col-lg-4">
                <div class="card border-0 shadow-lg mb-4" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #2196f3 0%, #1565c0 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-clock-history me-2"></i>Timeline
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        <div class="timeline">
                            <div class="timeline-item d-flex align-items-center mb-3">
                                <div class="timeline-marker me-3" style="width: 12px; height: 12px; background: #2196f3; border-radius: 50%;"></div>
                                <div>
                                    <h6 class="mb-0" style="font-weight: 600;">Created</h6>
                                    <small class="text-muted">{{ $transaction->created_at->format('M d, Y h:i A') }}</small>
                                </div>
                            </div>
                            @if($transaction->updated_at != $transaction->created_at)
                            <div class="timeline-item d-flex align-items-center">
                                <div class="timeline-marker me-3" style="width: 12px; height: 12px; background: #4caf50; border-radius: 50%;"></div>
                                <div>
                                    <h6 class="mb-0" style="font-weight: 600;">Last Updated</h6>
                                    <small class="text-muted">{{ $transaction->updated_at->format('M d, Y h:i A') }}</small>
                                </div>
                            </div>
                            @endif
                        </div>
                    </div>
                </div>
                
                <!-- User Wallet Info -->
                <div class="card border-0 shadow-lg mb-4" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-wallet2 me-2"></i>User Wallet
                        </h5>
                    </div>
                    <div class="card-body p-4 text-center">
                        <h3 class="mb-1 text-success" style="font-weight: 700;">₹{{ number_format(($transaction->user->deposit_balance ?? 0) + ($transaction->user->winnings_balance ?? 0), 2) }}</h3>
                        <small class="text-muted">Current Balance</small>
                    </div>
                </div>
                
                @if($transaction->type === 'withdrawal' || $transaction->type === 'deposit')
                <!-- Bank Details -->
                <div class="card border-0 shadow-lg" style="border-radius: 20px; backdrop-filter: blur(10px); background: rgba(255,255,255,0.95);">
                    <div class="card-header border-0 py-4" style="background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); border-radius: 20px 20px 0 0;">
                        <h5 class="mb-0 text-white" style="font-weight: 600;">
                            <i class="bi bi-bank me-2"></i>Payment Details
                        </h5>
                    </div>
                    <div class="card-body p-4">
                        @if($paymentDetails)
                        @if($paymentDetails->upi_id)
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-primary mb-1">UPI ID</label>
                            <p class="mb-0 font-monospace">{{ $paymentDetails->upi_id }}</p>
                        </div>
                        @endif
                        @if($paymentDetails->phone_number)
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-primary mb-1">Phone Number</label>
                            <p class="mb-0 font-monospace">{{ $paymentDetails->phone_number }}</p>
                        </div>
                        @endif
                        @if($paymentDetails->account_holder_name)
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-primary mb-1">Account Holder Name</label>
                            <p class="mb-0">{{ $paymentDetails->account_holder_name }}</p>
                        </div>
                        @endif
                        @if($paymentDetails->account_number)
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-primary mb-1">Account Number</label>
                            <p class="mb-0 font-monospace">{{ $paymentDetails->account_number }}</p>
                        </div>
                        @endif
                        @if($paymentDetails->bank_name)
                        <div class="mb-3">
                            <label class="form-label fw-semibold text-primary mb-1">Bank Name</label>
                            <p class="mb-0">{{ $paymentDetails->bank_name }}</p>
                        </div>
                        @endif
                        @if($paymentDetails->ifsc_code)
                        <div class="mb-0">
                            <label class="form-label fw-semibold text-primary mb-1">IFSC Code</label>
                            <p class="mb-0 font-monospace">{{ $paymentDetails->ifsc_code }}</p>
                        </div>
                        @endif
                        @else
                        <p class="text-muted mb-0 text-center">No payment details available</p>
                        @endif
                    </div>
                </div>
                @endif
            </div>
        </div>
    </div>
</div>
@endsection
